/**
 * Integration test THẬT cho tính nguyên tử của hai thao tác ảnh CÔNG KHAI (Đợt 2D):
 * `commitPublicFileUpload` và `commitPublicFileDelete`.
 *
 * CÁCH CHẠY:
 *   ACCEPTANCE_SAGA_TEST_DATABASE_URL=... npx vitest run tests/public-file-mutations.integration.test.ts
 *
 * Không đặt biến này thì suite tự SKIP.
 *
 * VÌ SAO CẦN POSTGRES THẬT: mock không kiểm được advisory lock, constraint kiểm tra trần ảnh,
 * transaction rollback khi audit lỗi, hay hai request đồng thời tranh chấp slot.
 */

import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import postgres, { type Sql } from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  getPublicIntakeRepository,
  PublicFileMutationRejectedError,
} from "@/modules/public-intake/repository";
import { MAX_CERTIFICATE_PHOTOS } from "@/modules/public-intake/upload-commit";

const TEST_DB_URL = process.env.ACCEPTANCE_SAGA_TEST_DATABASE_URL;
const hasTestDb = Boolean(TEST_DB_URL && TEST_DB_URL.trim().length > 0);

if (!hasTestDb) {
  console.warn(
    "[public-file-mutations] BỎ QUA — đặt ACCEPTANCE_SAGA_TEST_DATABASE_URL trỏ tới một Postgres " +
      "THỬ NGHIỆM (không phải production) để chạy integration test này.",
  );
} else if (
  process.env.SUPABASE_DATABASE_URL &&
  process.env.SUPABASE_DATABASE_URL.trim() === TEST_DB_URL?.trim()
) {
  throw new Error(
    "ACCEPTANCE_SAGA_TEST_DATABASE_URL trùng với SUPABASE_DATABASE_URL — có vẻ đang trỏ nhầm vào " +
      "database THẬT. Dừng lại để tránh ghi dữ liệu rác vào production.",
  );
}

const REPO_ROOT = join(__dirname, "..");
const MIGRATION_FILES = readdirSync(join(REPO_ROOT, "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => join("supabase", "migrations", file));

const OWNER_ID = "owner_pub_1";

const globalDatabase = globalThis as typeof globalThis & { __landOcrSupabaseSql?: Sql };

describe.skipIf(!hasTestDb)("Thao tác ảnh công khai — nguyên tử trên Postgres thật", () => {
  let sql: Sql;
  let submissionId: string;

  beforeAll(async () => {
    sql = postgres(TEST_DB_URL!, { prepare: false, max: 5, ssl: "prefer" });
    globalDatabase.__landOcrSupabaseSql = sql;

    await sql.unsafe(`
      do $$ begin
        if not exists (select from pg_roles where rolname = 'anon') then
          create role anon nologin;
        end if;
        if not exists (select from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin;
        end if;
      end $$;
      create schema if not exists extensions;
      do $$ begin
        begin
          create extension if not exists pgcrypto;
        exception when insufficient_privilege then
          null;
        end;
      end $$;
    `);

    const bootstrapped = await sql<{ exists: boolean }[]>`
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'users'
      ) as exists
    `;
    if (!bootstrapped[0]?.exists) {
      for (const relativePath of MIGRATION_FILES) {
        await sql.unsafe(readFileSync(join(REPO_ROOT, relativePath), "utf8"));
      }
    }
  }, 120_000);

  afterAll(async () => {
    delete globalDatabase.__landOcrSupabaseSql;
    if (sql) await sql.end();
  });

  beforeEach(async () => {
    submissionId = `test_pub_${randomUUID()}`;
    await sql`
      insert into public.public_submissions
        (submission_id, receipt_code, status, phone, access_code_hash, consent_version,
         drive_folder_id, claimed_by, draft_json)
      values
        (${submissionId}, ${`PC-TEST-${randomUUID()}`}, 'DRAFT', '0912345678', 'test-hash',
         'v1', 'test-folder', '',
         ${JSON.stringify({
           certificate: { issueNumber: "AD 000001", issueDate: "2020-01-01", registryNumber: "CH1" },
           owners: [
             { id: OWNER_ID, ownerType: "CA_NHAN", fullName: "Nguyễn Văn A" },
           ],
           parcels: [],
           assets: [],
           phone: "0912345678",
           consentAccepted: true,
         })}::jsonb)
    `;
  });

  afterEach(async () => {
    await sql`delete from public.audit_logs where entity_id = ${submissionId}`;
    await sql`delete from public.request_log where idempotency_key like ${`%${submissionId}%`}`;
    await sql`delete from public.public_files where submission_id = ${submissionId}`;
    await sql`delete from public.public_submissions where submission_id = ${submissionId}`;
  });

  function publicUploadInput(overrides: Record<string, unknown> = {}) {
    const suffix = randomUUID();
    return {
      submissionId,
      requestId: randomUUID(),
      idempotencyKey: `PUBLIC_UPLOAD_COMPLETE:${submissionId}:${suffix}`,
      mutationHash: `hash-${suffix}`,
      documentType: "CERTIFICATE" as const,
      ownerId: "",
      replaceFileId: "",
      file: {
        fileId: `test_pub_file_${suffix}`,
        driveFileId: `drive_pub_${suffix}`,
        mimeType: "image/jpeg",
        sizeBytes: 1_000,
        checksum: `checksum-${suffix}`,
        fileName: `PUB-CERTIFICATE-${suffix}.jpg`,
      },
      ...overrides,
    };
  }

  async function insertFile(overrides: Record<string, unknown> = {}): Promise<string> {
    const fileId = (overrides.fileId as string) ?? `test_pub_file_${randomUUID()}`;
    await sql`
      insert into public.public_files
        (file_id, submission_id, owner_id, document_type, drive_file_id, mime_type, size_bytes,
         checksum_sha256, file_name, status)
      values
        (${fileId}, ${submissionId}, ${(overrides.ownerId as string) ?? ""},
         ${(overrides.documentType as string) ?? "CERTIFICATE"}, ${`drive_${fileId}`},
         'image/jpeg', ${(overrides.sizeBytes as number) ?? 1_000}, ${`sum_${fileId}`},
         ${`file-${fileId}.jpg`}, ${(overrides.status as string) ?? "UPLOADED"})
    `;
    return fileId;
  }

  async function activeFileCount(): Promise<number> {
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count from public.public_files
      where submission_id = ${submissionId} and status = 'UPLOADED'
    `;
    return Number(rows[0]?.count ?? "0");
  }

  async function auditCount(action: string): Promise<number> {
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count from public.audit_logs
      where entity_id = ${submissionId} and action = ${action}
    `;
    return Number(rows[0]?.count ?? "0");
  }

  async function withFailingAudit(action: string, run: () => Promise<void>): Promise<void> {
    await sql.unsafe(`
      create or replace function public.__test_fail_pub_audit() returns trigger as $$
      begin
        if new.action = '${action}' then
          raise exception 'test: audit insert failed';
        end if;
        return new;
      end;
      $$ language plpgsql;
      drop trigger if exists __test_fail_pub_audit on public.audit_logs;
      create trigger __test_fail_pub_audit before insert on public.audit_logs
      for each row execute function public.__test_fail_pub_audit();
    `);
    try {
      await run();
    } finally {
      await sql.unsafe(`
        drop trigger if exists __test_fail_pub_audit on public.audit_logs;
        drop function if exists public.__test_fail_pub_audit();
      `);
    }
  }

  // ── PF-01: Cán bộ claim trước commit → upload bị từ chối ──────────────────

  it("PF-01: hồ sơ bị cán bộ claim đồng thời → upload công khai bị từ chối", async () => {
    const repo = getPublicIntakeRepository();
    const input = publicUploadInput();

    // Cán bộ claim hồ sơ trước khi commit
    await sql`
      update public.public_submissions
      set claimed_by = 'canbo@phongchau.gov.vn', status = 'UNDER_REVIEW'
      where submission_id = ${submissionId}
    `;

    await expect(repo.commitPublicFileUpload(input)).rejects.toThrow(
      PublicFileMutationRejectedError,
    );

    // Không có file mới, không có audit
    expect(await activeFileCount()).toBe(0);
    expect(await auditCount("PUBLIC_FILE_UPLOADED")).toBe(0);
  });

  // ── PF-02: Audit upload lỗi → file và request_log rollback ────────────────

  it("PF-02: audit upload công khai lỗi → file và request_log rollback", async () => {
    const repo = getPublicIntakeRepository();
    const input = publicUploadInput();

    await withFailingAudit("PUBLIC_FILE_UPLOADED", async () => {
      await expect(repo.commitPublicFileUpload(input)).rejects.toThrow(/audit/i);
    });

    // File KHÔNG vào database
    expect(await activeFileCount()).toBe(0);
    // Không có request_log replay
    const log = await sql`
      select 1 from public.request_log where idempotency_key = ${input.idempotencyKey}
    `;
    expect(log).toHaveLength(0);
  });

  // ── PF-03: Audit delete lỗi → ảnh vẫn UPLOADED ───────────────────────────

  it("PF-03: audit delete công khai lỗi → ảnh vẫn UPLOADED", async () => {
    const fileId = await insertFile();
    const repo = getPublicIntakeRepository();
    const suffix = randomUUID();

    await withFailingAudit("PUBLIC_FILE_DELETED", async () => {
      await expect(
        repo.commitPublicFileDelete({
          submissionId,
          fileId,
          requestId: randomUUID(),
          idempotencyKey: `PUBLIC_FILE_DELETE:${submissionId}:${suffix}`,
          mutationHash: `hash-del-${suffix}`,
        }),
      ).rejects.toThrow(/audit/i);
    });

    // Ảnh vẫn còn hiệu lực
    const rows = await sql<{ status: string }[]>`
      select status from public.public_files
      where submission_id = ${submissionId} and file_id = ${fileId}
    `;
    expect(rows[0]?.status).toBe("UPLOADED");
  });

  // ── PF-04: Hai upload đồng thời ở ảnh GCN thứ 10 → chỉ một thành công ───

  it("PF-04: hai upload công khai đồng thời ở ảnh GCN thứ 10 → chỉ một thành công", async () => {
    // Tạo MAX_CERTIFICATE_PHOTOS - 1 ảnh (9 ảnh) 
    for (let i = 0; i < MAX_CERTIFICATE_PHOTOS - 1; i++) {
      await insertFile();
    }
    expect(await activeFileCount()).toBe(MAX_CERTIFICATE_PHOTOS - 1);

    const repo = getPublicIntakeRepository();
    const inputA = publicUploadInput();
    const inputB = publicUploadInput();

    const results = await Promise.allSettled([
      repo.commitPublicFileUpload(inputA),
      repo.commitPublicFileUpload(inputB),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Chỉ một trong hai thành công
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      PublicFileMutationRejectedError,
    );

    // Tổng ảnh đúng bằng trần
    expect(await activeFileCount()).toBe(MAX_CERTIFICATE_PHOTOS);
  }, 30_000);
});
