/**
 * Integration test THẬT cho tính nguyên tử của ba thao tác ảnh của cán bộ (Đợt 2C):
 * `commitOfficerFileUpload`, `commitOfficerFileDelete`, `commitOfficerFileOwnerReassign`.
 *
 * CÁCH CHẠY:
 *   ACCEPTANCE_SAGA_TEST_DATABASE_URL=... npx vitest run tests/officer-file-mutations.integration.test.ts
 *
 * Không đặt biến này thì suite tự SKIP. AN TOÀN: tự chặn cứng nếu
 * `ACCEPTANCE_SAGA_TEST_DATABASE_URL` trùng `SUPABASE_DATABASE_URL` — cùng cơ chế đã dùng ở
 * `tests/staging-rehearsal-acceptance-saga.integration.test.ts`.
 *
 * VÌ SAO CẦN POSTGRES THẬT: bốn điều dưới đây **không** kiểm được bằng mock, và cả bốn đều là lỗi
 * dữ liệu chứ không phải lỗi giao diện.
 *
 *   1. **Audit lỗi sau khi ảnh đã commit.** Bản đầu của PR gọi `appendFile()` rồi `appendAudit()`
 *      riêng: audit lỗi thì API trả 500 nhưng ảnh **đã** vào hồ sơ, và lần gọi lại đi vào nhánh
 *      replay nên dòng audit thiếu đó không bao giờ được ghi. Chỉ transaction thật chứng minh được
 *      "audit lỗi ⇒ ảnh cũng không vào".
 *   2. **Hai lượt tải ảnh đồng thời** cùng đi qua `initiate` rồi cùng vượt trần 10 ảnh GCN.
 *   3. **Tiếp nhận chính thức đồng thời với gỡ ảnh**: lượt gỡ đã qua cửa `mayStaffEdit` cũ vẫn ghi
 *      được sau khi hồ sơ đã sang `ACCEPTED`.
 *   4. **Trần dung lượng tính bằng byte thật trên Drive**, không phải số client khai lúc `initiate`.
 */

import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import postgres, { type Sql } from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  getPublicIntakeRepository,
  OfficerFileMutationRejectedError,
} from "@/modules/public-intake/repository";
import { MAX_CERTIFICATE_PHOTOS, SUBMISSION_BYTE_BUDGET } from "@/modules/public-intake/upload-commit";

const TEST_DB_URL = process.env.ACCEPTANCE_SAGA_TEST_DATABASE_URL;
const hasTestDb = Boolean(TEST_DB_URL && TEST_DB_URL.trim().length > 0);

if (!hasTestDb) {
  console.warn(
    "[officer-file-mutations] BỎ QUA — đặt ACCEPTANCE_SAGA_TEST_DATABASE_URL trỏ tới một Postgres " +
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

const OFFICER = "canbo.tichhop@phongchau.gov.vn";
const OTHER_OFFICER = "canbo.khac@phongchau.gov.vn";
const OWNER_ID = "owner_1";
const OTHER_OWNER_ID = "owner_2";

/**
 * `getDatabase()` cache client trong `globalThis` và mặc định `max: 1`. Đặt thẳng client của test
 * vào đó để (a) trỏ đúng database thử nghiệm, (b) có **nhiều** connection — hai transaction đồng
 * thời là điều kiện cần của các ca tranh chấp bên dưới.
 */
const globalDatabase = globalThis as typeof globalThis & { __landOcrSupabaseSql?: Sql };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!hasTestDb)("Thao tác ảnh của cán bộ — nguyên tử trên Postgres thật", () => {
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
    submissionId = `test_sub_${randomUUID()}`;
    await sql`
      insert into public.public_submissions
        (submission_id, receipt_code, status, phone, access_code_hash, consent_version,
         drive_folder_id, claimed_by, draft_json)
      values
        (${submissionId}, ${`PC-TEST-${randomUUID()}`}, 'UNDER_REVIEW', '0912345678', 'test-hash',
         'v1', 'test-folder', ${OFFICER},
         ${JSON.stringify({
           certificate: { issueNumber: "AD 000001", issueDate: "2020-01-01", registryNumber: "CH1" },
           owners: [
             { id: OWNER_ID, ownerType: "CA_NHAN", fullName: "Nguyễn Văn A" },
             { id: OTHER_OWNER_ID, ownerType: "CA_NHAN", fullName: "Trần Thị B" },
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

  function uploadInput(overrides: Record<string, unknown> = {}) {
    const suffix = randomUUID();
    return {
      submissionId,
      actorEmail: OFFICER,
      requestId: randomUUID(),
      idempotencyKey: `OFFICER_UPLOAD_COMPLETE:${submissionId}:${suffix}`,
      mutationHash: `hash-${suffix}`,
      documentType: "CERTIFICATE" as const,
      ownerId: "",
      replaceFileId: "",
      file: {
        fileId: `test_file_${suffix}`,
        driveFileId: `drive_${suffix}`,
        mimeType: "image/jpeg",
        sizeBytes: 1_000,
        checksum: `checksum-${suffix}`,
        fileName: `OFFICER-CERTIFICATE-${suffix}.jpg`,
      },
      ...overrides,
    };
  }

  async function insertFile(overrides: Record<string, unknown> = {}): Promise<string> {
    const fileId = (overrides.fileId as string) ?? `test_file_${randomUUID()}`;
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

  /**
   * Chặn đúng lệnh `insert` vào `audit_logs` cho một hành động, bằng trigger tạm.
   *
   * Đây là cách duy nhất mô phỏng được "audit lỗi" mà không phải sửa mã sản phẩm: nếu ghi ảnh và ghi
   * audit **không** cùng transaction, ảnh vẫn nằm lại trong `public_files` sau khi trigger nổ.
   */
  async function withFailingAudit(action: string, run: () => Promise<void>): Promise<void> {
    await sql.unsafe(`
      create or replace function public.__test_fail_audit() returns trigger as $$
      begin
        if new.action = '${action}' then
          raise exception 'test: audit insert failed';
        end if;
        return new;
      end;
      $$ language plpgsql;
      drop trigger if exists __test_fail_audit on public.audit_logs;
      create trigger __test_fail_audit before insert on public.audit_logs
      for each row execute function public.__test_fail_audit();
    `);
    try {
      await run();
    } finally {
      await sql.unsafe(`
        drop trigger if exists __test_fail_audit on public.audit_logs;
        drop function if exists public.__test_fail_audit();
      `);
    }
  }

  it("OF-01: audit lỗi ⇒ ảnh KHÔNG vào hồ sơ, không có request_log để replay", async () => {
    const repository = getPublicIntakeRepository();
    const input = uploadInput();

    await withFailingAudit("SUBMISSION_OFFICER_FILE_UPLOADED", async () => {
      await expect(repository.commitOfficerFileUpload(input)).rejects.toThrow(
        /audit insert failed/,
      );
    });

    expect(await activeFileCount()).toBe(0);
    const replay = await sql`
      select idempotency_key from public.request_log where idempotency_key = ${input.idempotencyKey}
    `;
    // Nếu request_log còn lại thì lần gọi lại sẽ "thành công" mà ảnh chưa bao giờ được ghi.
    expect(replay.length).toBe(0);

    // Gọi lại với cùng khóa (audit đã hết lỗi) phải ghi được đủ cả ảnh lẫn audit.
    await repository.commitOfficerFileUpload(input);
    expect(await activeFileCount()).toBe(1);
    expect(await auditCount("SUBMISSION_OFFICER_FILE_UPLOADED")).toBe(1);
  });

  it("OF-02: replay cùng khóa trả lại đúng kết quả cũ và KHÔNG ghi audit lần hai", async () => {
    const repository = getPublicIntakeRepository();
    const input = uploadInput();

    const first = await repository.commitOfficerFileUpload(input);
    const second = await repository.commitOfficerFileUpload(input);

    expect(second.replayed).toBe(true);
    expect(second.summary.fileId).toBe(first.summary.fileId);
    expect(await activeFileCount()).toBe(1);
    expect(await auditCount("SUBMISSION_OFFICER_FILE_UPLOADED")).toBe(1);
  });

  it("OF-03: hai lượt tải ảnh đồng thời không vượt được trần ảnh Giấy chứng nhận", async () => {
    const repository = getPublicIntakeRepository();
    for (let index = 0; index < MAX_CERTIFICATE_PHOTOS - 1; index += 1) {
      await insertFile();
    }

    const results = await Promise.allSettled([
      repository.commitOfficerFileUpload(uploadInput()),
      repository.commitOfficerFileUpload(uploadInput()),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      OfficerFileMutationRejectedError,
    );
    expect((rejected[0] as PromiseRejectedResult).reason.reason).toBe("CERTIFICATE_LIMIT");
    expect(await activeFileCount()).toBe(MAX_CERTIFICATE_PHOTOS);
  });

  it("OF-04: trần dung lượng tính bằng byte thật, vượt thì không ghi gì", async () => {
    const repository = getPublicIntakeRepository();
    await insertFile({ sizeBytes: SUBMISSION_BYTE_BUDGET - 100 });

    await expect(
      repository.commitOfficerFileUpload(
        uploadInput({ file: { ...uploadInput().file, sizeBytes: 1_000 } }),
      ),
    ).rejects.toMatchObject({ reason: "BYTE_BUDGET" });

    expect(await activeFileCount()).toBe(1);
    expect(await auditCount("SUBMISSION_OFFICER_FILE_UPLOADED")).toBe(0);
  });

  it("OF-05: hồ sơ được tiếp nhận chính thức đồng thời ⇒ lượt gỡ ảnh bị từ chối", async () => {
    const repository = getPublicIntakeRepository();
    const fileId = await insertFile();

    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const accepting = sql.begin(async (transaction) => {
      await transaction`
        select submission_id from public.public_submissions
        where submission_id = ${submissionId} for update
      `;
      await transaction`
        update public.public_submissions set status = 'ACCEPTED', updated_at = now()
        where submission_id = ${submissionId}
      `;
      await hold;
    });

    // Chờ transaction "tiếp nhận" giữ được khóa hàng hồ sơ trước khi thử gỡ ảnh.
    await sleep(150);
    const deleting = repository.commitOfficerFileDelete({
      submissionId,
      fileId,
      actorEmail: OFFICER,
      requestId: randomUUID(),
    });
    // Lượt gỡ phải ĐANG CHỜ khóa, không được đi tiếp bằng dữ liệu cũ.
    await sleep(150);
    release?.();
    await accepting;

    await expect(deleting).rejects.toMatchObject({ reason: "FORBIDDEN" });
    expect(await activeFileCount()).toBe(1);
    expect(await auditCount("SUBMISSION_OFFICER_FILE_DELETED")).toBe(0);
  });

  it("OF-06: hồ sơ chuyển sang cán bộ khác đồng thời ⇒ lượt gán lại chủ bị từ chối", async () => {
    const repository = getPublicIntakeRepository();
    const fileId = await insertFile({ documentType: "CITIZEN_ID_FRONT", ownerId: OWNER_ID });

    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transferring = sql.begin(async (transaction) => {
      await transaction`
        select submission_id from public.public_submissions
        where submission_id = ${submissionId} for update
      `;
      await transaction`
        update public.public_submissions set claimed_by = ${OTHER_OFFICER}, updated_at = now()
        where submission_id = ${submissionId}
      `;
      await hold;
    });

    await sleep(150);
    const reassigning = repository.commitOfficerFileOwnerReassign({
      submissionId,
      fileId,
      newOwnerId: OTHER_OWNER_ID,
      actorEmail: OFFICER,
      requestId: randomUUID(),
    });
    await sleep(150);
    release?.();
    await transferring;

    await expect(reassigning).rejects.toMatchObject({ reason: "FORBIDDEN" });
    const rows = await sql<{ owner_id: string }[]>`
      select owner_id from public.public_files where file_id = ${fileId}
    `;
    expect(rows[0]?.owner_id).toBe(OWNER_ID);
    expect(await auditCount("SUBMISSION_OFFICER_FILE_OWNER_REASSIGNED")).toBe(0);
  });

  it("OF-07: gỡ ảnh thành công là xóa MỀM và ghi audit trong cùng transaction", async () => {
    const repository = getPublicIntakeRepository();
    const fileId = await insertFile();

    const first = await repository.commitOfficerFileDelete({
      submissionId,
      fileId,
      actorEmail: OFFICER,
      requestId: randomUUID(),
    });
    const second = await repository.commitOfficerFileDelete({
      submissionId,
      fileId,
      actorEmail: OFFICER,
      requestId: randomUUID(),
    });

    expect(first.alreadyDeleted).toBe(false);
    expect(second.alreadyDeleted).toBe(true);
    const rows = await sql<{ status: string }[]>`
      select status from public.public_files where file_id = ${fileId}
    `;
    // Dòng vẫn còn, chỉ đổi trạng thái — tệp trên Drive không bị chạm tới.
    expect(rows[0]?.status).toBe("DELETED");
    // Gọi lần hai là no-op nên KHÔNG ghi audit lần hai.
    expect(await auditCount("SUBMISSION_OFFICER_FILE_DELETED")).toBe(1);
  });

  it("OF-08: audit lỗi khi gỡ ảnh ⇒ ảnh vẫn còn hiệu lực", async () => {
    const repository = getPublicIntakeRepository();
    const fileId = await insertFile();

    await withFailingAudit("SUBMISSION_OFFICER_FILE_DELETED", async () => {
      await expect(
        repository.commitOfficerFileDelete({
          submissionId,
          fileId,
          actorEmail: OFFICER,
          requestId: randomUUID(),
        }),
      ).rejects.toThrow(/audit insert failed/);
    });

    const rows = await sql<{ status: string }[]>`
      select status from public.public_files where file_id = ${fileId}
    `;
    expect(rows[0]?.status).toBe("UPLOADED");
    expect(await activeFileCount()).toBe(1);
  });

  it("OF-09: hai lượt gán lại đồng thời vào cùng ô đích — đúng một lượt thành công", async () => {
    const repository = getPublicIntakeRepository();
    const frontA = await insertFile({ documentType: "CITIZEN_ID_FRONT", ownerId: OWNER_ID });
    const backA = await insertFile({ documentType: "CITIZEN_ID_BACK", ownerId: OWNER_ID });

    const results = await Promise.allSettled([
      repository.commitOfficerFileOwnerReassign({
        submissionId,
        fileId: frontA,
        newOwnerId: OTHER_OWNER_ID,
        actorEmail: OFFICER,
        requestId: randomUUID(),
      }),
      repository.commitOfficerFileOwnerReassign({
        submissionId,
        fileId: backA,
        newOwnerId: OTHER_OWNER_ID,
        actorEmail: OFFICER,
        requestId: randomUUID(),
      }),
    ]);

    // Hai ảnh khác mặt nên cả hai đều gán được — điều phải giữ là không mất ảnh nào.
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    const rows = await sql<{ owner_id: string; status: string }[]>`
      select owner_id, status from public.public_files
      where submission_id = ${submissionId} order by file_id
    `;
    expect(rows.every((row) => row.status === "UPLOADED")).toBe(true);
    expect(rows.every((row) => row.owner_id === OTHER_OWNER_ID)).toBe(true);
  });

  it("OF-10: ô đích đã có ảnh cùng mặt ⇒ 409, không đẩy ảnh nào xuống lịch sử", async () => {
    const repository = getPublicIntakeRepository();
    const frontA = await insertFile({ documentType: "CITIZEN_ID_FRONT", ownerId: OWNER_ID });
    const frontB = await insertFile({ documentType: "CITIZEN_ID_FRONT", ownerId: OTHER_OWNER_ID });

    await expect(
      repository.commitOfficerFileOwnerReassign({
        submissionId,
        fileId: frontA,
        newOwnerId: OTHER_OWNER_ID,
        actorEmail: OFFICER,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow(/đã có ảnh cho mặt CCCD/);

    const rows = await sql<{ file_id: string; owner_id: string; status: string }[]>`
      select file_id, owner_id, status from public.public_files
      where submission_id = ${submissionId} order by file_id
    `;
    expect(rows.find((row) => row.file_id === frontA)?.owner_id).toBe(OWNER_ID);
    expect(rows.find((row) => row.file_id === frontB)?.status).toBe("UPLOADED");
  });

  it("OF-11: file_summary_json được làm mới trong cùng transaction với thay đổi ảnh", async () => {
    const repository = getPublicIntakeRepository();

    const committed = await repository.commitOfficerFileUpload(uploadInput());
    const afterUpload = await sql<{ file_summary_json: unknown }[]>`
      select file_summary_json from public.public_submissions where submission_id = ${submissionId}
    `;
    const summaries = afterUpload[0]?.file_summary_json as { fileId: string; status: string }[];
    expect(summaries.map((summary) => summary.fileId)).toContain(committed.summary.fileId);

    await repository.commitOfficerFileDelete({
      submissionId,
      fileId: committed.summary.fileId,
      actorEmail: OFFICER,
      requestId: randomUUID(),
    });
    const afterDelete = await sql<{ file_summary_json: unknown }[]>`
      select file_summary_json from public.public_submissions where submission_id = ${submissionId}
    `;
    const updated = afterDelete[0]?.file_summary_json as { fileId: string; status: string }[];
    expect(updated.find((summary) => summary.fileId === committed.summary.fileId)?.status).toBe(
      "DELETED",
    );
  });
});
