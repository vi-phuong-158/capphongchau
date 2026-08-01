/**
 * DIỄN TẬP STAGING THẬT cho saga tiếp nhận chính thức (`runOfficialAcceptance`).
 *
 * Đây là bằng chứng cho task gác cổng "Gác cổng trước khi đảo OFFICIAL_ACCEPTANCE_ENABLED = true"
 * trong `docs/brain/04-current-tasks.md`. Khác với `tests/staging-rehearsal-scenarios.test.ts` (bị
 * đánh giá KHÔNG ĐẠT vì chỉ mock JS thuần, không chạm code saga thật — xem
 * `docs/brain/06-ai-working-log.md` [2026-07-24]), file này:
 *   - Gọi THẬT `runOfficialAcceptance` từ `src/modules/submissions/acceptance-saga.ts`.
 *   - Chạy TOÀN BỘ SQL trên một Postgres THẬT (áp cả 2 file migration y hệt production).
 *   - Chỉ giả lập (mock) tầng Google Drive — vì thứ cần kiểm chứng là hành vi Postgres
 *     (advisory lock, transaction, `ON CONFLICT`, tên cột) chứ không phải chính Google Drive API.
 *
 * CÁCH CHẠY:
 *   1. Chuẩn bị một Postgres THỬ NGHIỆM (KHÔNG PHẢI production) — ví dụ một project Supabase
 *      test riêng, hoặc Postgres local/docker. Lấy connection string dạng
 *      `postgres://user:pass@host:port/db`.
 *   2. Đặt biến môi trường `ACCEPTANCE_SAGA_TEST_DATABASE_URL` trỏ tới đó.
 *   3. Chạy: `ACCEPTANCE_SAGA_TEST_DATABASE_URL=... npx vitest run tests/staging-rehearsal-acceptance-saga.integration.test.ts`
 *
 * Không đặt biến này thì toàn bộ suite tự SKIP (không làm hỏng `npm test` mặc định), và in ra
 * console một dòng nhắc rõ lý do skip.
 *
 * AN TOÀN: file tự chặn cứng nếu `ACCEPTANCE_SAGA_TEST_DATABASE_URL` trùng với `SUPABASE_DATABASE_URL`
 * — tránh trường hợp gõ nhầm biến rồi chạy diễn tập lên thẳng database thật.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------------------------
// Fake Google Drive — đủ giống thật để saga chạy qua, nhưng cho phép tiêm lỗi có chủ đích.
// Dùng vi.hoisted vì vi.mock("googleapis", ...) bị hoist lên đầu file, cần state truy cập được
// từ bên trong factory.
// ---------------------------------------------------------------------------------------------
const drive = vi.hoisted(() => {
  const FOLDER_MIME = "application/vnd.google-apps.folder";
  interface Node {
    id: string;
    name: string;
    mimeType: string;
    parents: string[];
  }
  const nodes = new Map<string, Node>();
  let seq = 0;
  const callsByFile = new Map<string, number>();
  let activeUpdates = 0;
  let peakConcurrentUpdates = 0;

  const state = {
    /** Ném lỗi mạng giả khi `drive.files.update` được gọi cho đúng fileId này. */
    failOnFileId: null as string | null,
    reset() {
      nodes.clear();
      seq = 0;
      callsByFile.clear();
      activeUpdates = 0;
      peakConcurrentUpdates = 0;
      state.failOnFileId = null;
    },
    seedFile(id: string, parentId: string) {
      nodes.set(id, { id, name: id, mimeType: "image/jpeg", parents: [parentId] });
    },
    parentsOf(id: string): string[] {
      return [...(nodes.get(id)?.parents ?? [])];
    },
    updateCallsFor(id: string): number {
      return callsByFile.get(id) ?? 0;
    },
    peakConcurrentUpdates(): number {
      return peakConcurrentUpdates;
    },
  };

  function escapeQueryValue(value: string): string {
    return value.replace(/\\\\/g, "\\").replace(/\\'/g, "'");
  }

  const filesApi = {
    list: async ({ q }: { q: string }) => {
      const nameMatch = /name = '([^']*)'/.exec(q);
      const parentMatch = /'([^']*)' in parents/.exec(q);
      const name = escapeQueryValue(nameMatch?.[1] ?? "");
      const parentId = parentMatch?.[1] ?? "";
      const found = [...nodes.values()].find(
        (node) =>
          node.mimeType === FOLDER_MIME && node.name === name && node.parents.includes(parentId),
      );
      return { data: { files: found ? [{ id: found.id }] : [] } };
    },
    create: async ({
      requestBody,
    }: {
      requestBody: { name: string; mimeType?: string; parents?: string[] };
    }) => {
      seq += 1;
      const id = `${requestBody.mimeType === FOLDER_MIME ? "folder" : "file"}-${seq}`;
      nodes.set(id, {
        id,
        name: requestBody.name,
        mimeType: requestBody.mimeType ?? "application/octet-stream",
        parents: requestBody.parents ?? [],
      });
      return { data: { id } };
    },
    get: async ({ fileId }: { fileId: string }) => {
      const node = nodes.get(fileId);
      if (!node) throw new Error(`fake drive: không tìm thấy file ${fileId}`);
      return { data: { id: node.id, parents: [...node.parents], trashed: false } };
    },
    update: async ({
      fileId,
      addParents,
      removeParents,
    }: {
      fileId: string;
      addParents?: string;
      removeParents?: string;
    }) => {
      callsByFile.set(fileId, (callsByFile.get(fileId) ?? 0) + 1);
      activeUpdates += 1;
      peakConcurrentUpdates = Math.max(peakConcurrentUpdates, activeUpdates);
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (state.failOnFileId === fileId) {
          throw new Error("fake drive: mô phỏng mất mạng giữa chừng khi di chuyển file");
        }
        const node = nodes.get(fileId);
        if (!node) throw new Error(`fake drive: không tìm thấy file ${fileId}`);
        const removeSet = new Set((removeParents ?? "").split(",").filter(Boolean));
        node.parents = node.parents.filter((parentId) => !removeSet.has(parentId));
        if (addParents) node.parents.push(addParents);
        return { data: { id: node.id, parents: [...node.parents] } };
      } finally {
        activeUpdates -= 1;
      }
    },
    delete: async () => ({ data: {} }),
  };

  return { state, filesApi };
});

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class FakeOAuth2 {
        setCredentials(): void {}
        async getAccessToken(): Promise<{ token: string }> {
          return { token: "fake-access-token" };
        }
      },
    },
    drive: () => ({ files: drive.filesApi }),
    sheets: () => ({}),
  },
}));

// ---------------------------------------------------------------------------------------------
// Import SAU vi.mock (dù vitest tự hoist vi.mock lên đầu, viết theo thứ tự này cho rõ ràng).
// ---------------------------------------------------------------------------------------------
import {
  AcceptanceInProgressError,
  AcceptanceRetryableError,
  runOfficialAcceptance,
} from "@/modules/submissions/acceptance-saga";
import {
  getPublicIntakeRepository,
  SubmissionIdempotencyConflictError,
  SubmissionVersionConflictError,
} from "@/modules/public-intake/repository";
import { ensureSubmissionFolderReady } from "@/modules/public-intake/submission-folder";
import { newTimelineEvent } from "@/modules/public-intake/workflow";

const TEST_DB_URL = process.env.ACCEPTANCE_SAGA_TEST_DATABASE_URL;
const hasTestDb = Boolean(TEST_DB_URL && TEST_DB_URL.trim().length > 0);

if (!hasTestDb) {
  console.warn(
    "[staging-rehearsal] BỎ QUA — đặt biến môi trường ACCEPTANCE_SAGA_TEST_DATABASE_URL trỏ tới " +
      "một Postgres THỬ NGHIỆM (không phải production) để chạy diễn tập saga tiếp nhận chính thức thật.",
  );
} else if (
  process.env.SUPABASE_DATABASE_URL &&
  process.env.SUPABASE_DATABASE_URL.trim() === TEST_DB_URL?.trim()
) {
  throw new Error(
    "ACCEPTANCE_SAGA_TEST_DATABASE_URL trùng với SUPABASE_DATABASE_URL — có vẻ đang trỏ nhầm vào " +
      "database THẬT. Dừng lại để tránh ghi case/case_counters/id_reservations rác vào production.",
  );
}

const REPO_ROOT = join(__dirname, "..");

const MIGRATION_FILES = readdirSync(join(REPO_ROOT, "supabase", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => join("supabase", "migrations", f));
const ORIGINAL_ENV: Record<string, string | undefined> = {};
function setEnv(key: string, value: string): void {
  if (!(key in ORIGINAL_ENV)) ORIGINAL_ENV[key] = process.env[key];
  process.env[key] = value;
}
function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearCachedAppConnection(): void {
  delete (globalThis as typeof globalThis & { __landOcrSupabaseSql?: Sql }).__landOcrSupabaseSql;
}

async function bootstrapDatabase(sql: Sql): Promise<void> {
  // Cho phép chạy trên Postgres thường (không phải Supabase) — Supabase project thật đã có sẵn
  // schema `extensions`, role `anon`/`authenticated`, extension `pgcrypto`; các lệnh dưới đây là
  // no-op an toàn trên Supabase, và là điều kiện đủ để chạy trên Postgres local/docker.
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

  const alreadyApplied = await sql<{ exists: boolean }[]>`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'public_acceptance_sagas'
    ) as exists
  `;
  if (alreadyApplied[0]?.exists) {
    const phase3Applied = await sql<{ exists: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'public_submissions'
          and column_name = 'drive_folder_state'
      ) as exists
    `;
    if (!phase3Applied[0]?.exists) {
      const phase3Migration = readFileSync(
        join(REPO_ROOT, "supabase", "migrations", "202607290005_lazy_drive_folder_creation.sql"),
        "utf8",
      );
      await sql.unsafe(phase3Migration);
    }
    /*
     * `internal_notes` (202607290006) nằm trong `SUBMISSION_SELECT` dùng chung, nên thiếu nó là
     * **mọi** truy vấn đọc hồ sơ lỗi, không riêng chức năng ghi chú. Một database thử nghiệm đã
     * bootstrap từ trước đợt này sẽ không có cột đó — bù ở đây, cùng cách với catch-up của Phase 3.
     */
    const internalNotesApplied = await sql<{ exists: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'public_submissions'
          and column_name = 'internal_notes'
      ) as exists
    `;
    if (!internalNotesApplied[0]?.exists) {
      await sql.unsafe(
        readFileSync(
          join(REPO_ROOT, "supabase", "migrations", "202607290006_submission_internal_notes.sql"),
          "utf8",
        ),
      );
    }
    return;
  }

  for (const relativePath of MIGRATION_FILES) {
    const sqlText = readFileSync(join(REPO_ROOT, relativePath), "utf8");
    await sql.unsafe(sqlText);
  }
}

async function truncateAppTables(sql: Sql): Promise<void> {
  await sql.unsafe(`
    truncate table
      public.public_submissions, public.public_files, public.request_log,
      public.public_acceptance_sagas, public.case_counters, public.id_reservations,
      public.cases, public.owners, public.certificates, public.files,
      public.audit_logs, public.public_status_events
    restart identity cascade;
  `);
}

describe.skipIf(!hasTestDb)(
  "Diễn tập staging: saga tiếp nhận chính thức (Postgres thật, Drive giả lập)",
  () => {
    let bootstrapSql: Sql;

    beforeAll(async () => {
      setEnv("SUPABASE_DATABASE_URL", TEST_DB_URL!);
      setEnv("GOOGLE_DRIVE_CLIENT_ID", "test-drive-client-id");
      setEnv("GOOGLE_DRIVE_CLIENT_SECRET", "test-drive-client-secret");
      setEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "test-drive-refresh-token");
      setEnv("GOOGLE_MY_DRIVE_ROOT_FOLDER_ID", "root-folder-test");
      clearCachedAppConnection();

      bootstrapSql = postgres(TEST_DB_URL!, { prepare: false, max: 1, ssl: "prefer" });
      await bootstrapDatabase(bootstrapSql);
    }, 60_000);

    afterAll(async () => {
      const cached = (globalThis as typeof globalThis & { __landOcrSupabaseSql?: Sql })
        .__landOcrSupabaseSql;
      await cached?.end({ timeout: 5 });
      clearCachedAppConnection();
      await bootstrapSql?.end({ timeout: 5 });
      restoreEnv();
    });

    beforeEach(async () => {
      drive.state.reset();
      await truncateAppTables(bootstrapSql);
    });

    /** Mỗi hồ sơ có 2 CCCD, 1+ GCN sẵn sàng để saga di chuyển. */
    async function seedSubmission(draftOverrides: Record<string, unknown> = {}, fileCount = 3) {
      if (fileCount < 3) throw new Error("Fixture tiếp nhận cần tối thiểu 2 CCCD và 1 GCN.");
      const submissionId = `sub-${randomUUID()}`;
      const receiptCode = `PC-KK-2026-${randomUUID().slice(0, 8).toUpperCase()}`;
      const draft = {
        phone: "0912345678",
        owners: [
          {
            // Owner đầy đủ đúng shape `Owner` (types.ts) — mọi cột của public_owners là NOT NULL
            // và code luôn liệt kê đủ tên cột trong INSERT, nên thiếu MỘT trường cũng khiến
            // postgres.js gửi NULL tường minh (ghi đè default '') thay vì bỏ qua cột. Dữ liệu qua
            // API thật không bao giờ thiếu, vì draftSchema (validation.ts) bắt buộc đủ các trường
            // này; thiếu ở fixture chỉ che mất kết quả thật của bản vá P0-1/Q2 đang cần kiểm chứng.
            id: "owner-1",
            ownerType: "CA_NHAN",
            fullName: "Nguyễn Văn A",
            identityNumber: "012345678901",
            dateOfBirth: "1990-01-01",
            gender: "NAM",
            residenceAddress: "Tổ dân phố Hà Thạch",
            identitySource: "MANUAL",
            qrPayloadHash: "",
            qrDecoderVersion: "",
            qrParserVersion: "",
            identityStatus: "MANUAL_COMPLETE",
            identityConfirmedAt: "",
            identityOverrideReason: "",
            roleOnCertificate: "CA_NHAN",
            hasDistinctCurrentUser: false,
            currentUserName: "",
            currentUserCitizenId: "",
            currentUserAddress: "",
            changeReason: "",
          },
        ],
        // Đủ mọi cột NOT NULL của public_parcels — cùng lý do như owner ở trên: thiếu một trường
        // khiến postgres.js gửi NULL tường minh, ghi đè default '' của cột.
        parcels: [
          {
            id: "parcel-1",
            parcelIdCode: "",
            oldWard: "HA_THACH",
            mapSheetNumber: "",
            parcelNumber: "",
            addressOnCertificate: "",
            addressTwoLevel: "",
            area: "",
          },
        ],
        certificate: {
          issueNumber: "AB123456",
          issueDate: "2020-01-01",
          registryNumber: "CS00123",
        },
        assets: [],
        ...draftOverrides,
      };

      await bootstrapSql`
        insert into public.public_submissions (
          submission_id, receipt_code, status, phone, access_code_hash, consent_version,
          drive_folder_id, claimed_by, draft_json
        ) values (
          ${submissionId}, ${receiptCode}, 'UNDER_REVIEW', '0912345678', 'hash', 'v1',
          'inbox-folder-1', 'officer@example.com', ${JSON.stringify(draft)}::jsonb
        )
      `;

      const fileSpecs: Array<{
        fileId: string;
        driveFileId: string;
        documentType: "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
        ownerId: string;
      }> = [
        {
          fileId: `file-${randomUUID()}`,
          driveFileId: `drive-front-${randomUUID()}`,
          documentType: "CITIZEN_ID_FRONT",
          ownerId: "owner-1",
        },
        {
          fileId: `file-${randomUUID()}`,
          driveFileId: `drive-back-${randomUUID()}`,
          documentType: "CITIZEN_ID_BACK",
          ownerId: "owner-1",
        },
        {
          fileId: `file-${randomUUID()}`,
          driveFileId: `drive-cert-${randomUUID()}`,
          documentType: "CERTIFICATE",
          ownerId: "",
        },
      ];
      for (let index = 3; index < fileCount; index += 1) {
        fileSpecs.push({
          fileId: `file-${randomUUID()}`,
          driveFileId: `drive-cert-${randomUUID()}`,
          documentType: "CERTIFICATE",
          ownerId: "",
        });
      }

      for (const file of fileSpecs) {
        await bootstrapSql`
          insert into public.public_files (
            file_id, submission_id, owner_id, document_type, drive_file_id, mime_type,
            size_bytes, checksum_sha256, file_name, status
          ) values (
            ${file.fileId}, ${submissionId}, ${file.ownerId}, ${file.documentType}, ${file.driveFileId},
            'image/jpeg', 100000, 'checksum-placeholder', 'anh.jpg', 'UPLOADED'
          )
        `;
        drive.state.seedFile(file.driveFileId, "inbox-folder-1");
      }

      const record = await getPublicIntakeRepository().findById(submissionId);
      if (!record) throw new Error("Seed thất bại — không đọc lại được bản kê khai vừa tạo.");
      return { record, fileSpecs };
    }

    function baseInput(record: Awaited<ReturnType<typeof seedSubmission>>["record"]) {
      return {
        record,
        expectedVersion: record.version,
        actorEmail: "officer@example.com",
        actorDisplayName: "Cán bộ A",
        isAdministrator: false,
        requestId: `req-${randomUUID()}`,
      };
    }

    it("Phase 3: lease token text giữ nguyên micro-giây cho READY/FAILED và fencing", async () => {
      const repository = getPublicIntakeRepository();
      const fixedLeaseToken = "2026-07-29 16:15:36.185035+00";
      const seedLease = async (leaseToken: string) => {
        const submissionId = `lazy-token-${randomUUID()}`;
        await bootstrapSql`
            insert into public.public_submissions (
              submission_id, receipt_code, status, phone, access_code_hash, consent_version,
              drive_folder_id, drive_folder_state, drive_folder_lease_until, draft_json
            ) values (
              ${submissionId}, ${`PC-KK-2026-${randomUUID().slice(0, 8).toUpperCase()}`},
              'DRAFT', '0912345678', 'hash', 'v1', null, 'CREATING',
              (${leaseToken}::text)::timestamptz, '{}'::jsonb
            )
          `;
        const snapshot = await repository.getSubmissionFolderSnapshot(submissionId);
        expect(snapshot?.leaseToken).toBe(leaseToken);
        return submissionId;
      };

      // `timestamptz` chính xác tới micro-giây. Bound parameter phải đi qua `text` trước khi
      // PostgreSQL parse; nếu driver ép thành `Date`, .185035 thành .185 và fencing khớp 0 dòng.
      const readySubmissionId = await seedLease(fixedLeaseToken);
      const ready = await repository.markSubmissionFolderReady(
        readySubmissionId,
        "lazy-token-folder",
        fixedLeaseToken,
      );
      expect(ready).not.toBeNull();
      expect(ready).toMatchObject({ state: "READY", driveFolderId: "lazy-token-folder" });

      const failedSubmissionId = await seedLease(fixedLeaseToken);
      await repository.markSubmissionFolderFailed(failedSubmissionId, fixedLeaseToken);
      const failed = await repository.getSubmissionFolderSnapshot(failedSubmissionId);
      expect(failed).toMatchObject({ state: "FAILED", driveFolderId: null, leaseToken: "" });
      const [{ failedCount }] = await bootstrapSql<{ failedCount: number }[]>`
          select count(*)::integer as "failedCount"
          from public.public_submissions
          where submission_id = ${failedSubmissionId} and drive_folder_state = 'FAILED'
        `;
      expect(failedCount).toBe(1);

      const wrongTokenSubmissionId = await seedLease(fixedLeaseToken);
      const wrongToken = "2026-07-29 16:15:36.185036+00";
      await expect(
        repository.markSubmissionFolderReady(
          wrongTokenSubmissionId,
          "must-not-checkpoint",
          wrongToken,
        ),
      ).resolves.toBeNull();
      await repository.markSubmissionFolderFailed(wrongTokenSubmissionId, wrongToken);
      await expect(
        repository.getSubmissionFolderSnapshot(wrongTokenSubmissionId),
      ).resolves.toMatchObject({
        state: "CREATING",
        driveFolderId: null,
        leaseToken: fixedLeaseToken,
      });

      const staleLeaseToken = "2000-07-29 16:15:36.185035+00";
      const staleSubmissionId = await seedLease(staleLeaseToken);
      const newLease = await repository.tryAcquireSubmissionFolderLease(staleSubmissionId, 60);
      expect(newLease?.leaseToken).not.toBe(staleLeaseToken);
      await expect(
        repository.markSubmissionFolderReady(
          staleSubmissionId,
          "stale-worker-folder",
          staleLeaseToken,
        ),
      ).resolves.toBeNull();
      await expect(
        repository.getSubmissionFolderSnapshot(staleSubmissionId),
      ).resolves.toMatchObject({
        state: "CREATING",
        driveFolderId: null,
        leaseToken: newLease?.leaseToken,
      });
    }, 20_000);

    it("Phase 3: hai request đồng thời chỉ một request thắng lease PostgreSQL và tạo folder", async () => {
      const submissionId = `lazy-${randomUUID()}`;
      await bootstrapSql`
          insert into public.public_submissions (
            submission_id, receipt_code, status, phone, access_code_hash, consent_version,
            drive_folder_id, drive_folder_state, draft_json
          ) values (
            ${submissionId}, ${`PC-KK-2026-${randomUUID().slice(0, 8).toUpperCase()}`},
            'DRAFT', '0912345678', 'hash', 'v1', null, 'PENDING', '{}'::jsonb
          )
        `;

      const repository = getPublicIntakeRepository();
      let driveCalls = 0;
      const dependencies = {
        repository,
        storage: {
          ensureSubmissionFolder: async () => {
            driveCalls += 1;
            await new Promise<void>((resolve) => setTimeout(resolve, 25));
            return "lazy-originals-folder";
          },
        },
      };
      const record = { submissionId, driveFolderId: null };

      const results = await Promise.allSettled([
        ensureSubmissionFolderReady(record, dependencies),
        ensureSubmissionFolderReady(record, dependencies),
      ]);

      // Với pool một connection, request thứ hai có thể quan sát READY sau checkpoint thay vì
      // nhận 503. Dù lịch chạy nào, chỉ request thắng lease mới được gọi Drive/tạo folder.
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
      expect(
        results.map((result) => (result.status === "fulfilled" ? result.value : null)),
      ).toEqual(["lazy-originals-folder", "lazy-originals-folder"]);
      expect(driveCalls).toBe(1);
      await expect(ensureSubmissionFolderReady(record, dependencies)).resolves.toBe(
        "lazy-originals-folder",
      );
      expect(driveCalls).toBe(1);

      const checkpoint = await repository.getSubmissionFolderSnapshot(submissionId);
      expect(checkpoint).toMatchObject({
        state: "READY",
        driveFolderId: "lazy-originals-folder",
        attempts: 1,
      });
    }, 20_000);

    it(
      "Kịch bản 1: ngắt giữa chừng bước FILES_MOVED (di chuyển được 1/3 file) → retry cùng " +
        "idempotency key → tiếp tục đúng, file đã chuyển không bị chuyển lại, không sinh case trùng",
      async () => {
        const { record, fileSpecs } = await seedSubmission();
        const idempotencyKey = `key-${randomUUID()}`;
        const input = { ...baseInput(record), idempotencyKey, mutationHash: "hash-1" };

        // Ngắt mạng giả lập ngay khi di chuyển file thứ 2 (file 1 đã xong).
        drive.state.failOnFileId = fileSpecs[1].driveFileId;
        await expect(runOfficialAcceptance(input)).rejects.toBeInstanceOf(AcceptanceRetryableError);

        const [sagaAfterCrash] = await bootstrapSql<
          { moved_files: Record<string, string> | string; step: string }[]
        >`
          select moved_files, step from public.public_acceptance_sagas where submission_id = ${record.submissionId}
        `;
        // Supavisor transaction-mode pooler đôi khi trả jsonb dạng chuỗi thô cho raw query của
        // chính test này (không đi qua mapSagaRow của code thật) — chuẩn hóa trước khi assert.
        const movedFilesAfterCrash =
          typeof sagaAfterCrash.moved_files === "string"
            ? (JSON.parse(sagaAfterCrash.moved_files) as Record<string, string>)
            : sagaAfterCrash.moved_files;
        expect(Object.keys(movedFilesAfterCrash)).toHaveLength(1);
        expect(sagaAfterCrash.step).toBe("CASE_FOLDER_READY");
        expect(drive.state.updateCallsFor(fileSpecs[0].driveFileId)).toBe(1);

        // Mạng có lại — gọi tiếp với CÙNG idempotency key.
        drive.state.failOnFileId = null;
        const result = await runOfficialAcceptance(input);
        expect(result.status).toBe("ACCEPTED");
        expect(result.officialCaseId).toMatch(/^PHONGCHAU-\d{4}-\d{6}$/);

        // File 1 KHÔNG được gọi update lần 2 (không move lại file đã xong).
        expect(drive.state.updateCallsFor(fileSpecs[0].driveFileId)).toBe(1);
        // File 2 gọi 2 lần (lần đầu ném lỗi giả, lần retry mới thành công).
        expect(drive.state.updateCallsFor(fileSpecs[1].driveFileId)).toBe(2);
        // File 3 gọi đúng 1 lần.
        expect(drive.state.updateCallsFor(fileSpecs[2].driveFileId)).toBe(1);

        const [{ originals_folder_id: originalsFolderId }] = await bootstrapSql<
          { originals_folder_id: string }[]
        >`select originals_folder_id from public.public_acceptance_sagas where submission_id = ${record.submissionId}`;
        for (const file of fileSpecs) {
          expect(drive.state.parentsOf(file.driveFileId)).toContain(originalsFolderId);
        }

        const casesRows = await bootstrapSql`select case_id from public.cases`;
        expect(casesRows).toHaveLength(1);
        const filesRows = await bootstrapSql`select file_id from public.files`;
        expect(filesRows).toHaveLength(3);
        const reservationRows = await bootstrapSql`select * from public.id_reservations`;
        expect(reservationRows).toHaveLength(1);
      },
      30_000,
    );

    it("Phase 5A: mười file hoàn tất theo năm nhóm, Drive peak không vượt 2 và dữ liệu chính thức không trùng", async () => {
      const { record, fileSpecs } = await seedSubmission({}, 10);
      const result = await runOfficialAcceptance({
        ...baseInput(record),
        idempotencyKey: `key-${randomUUID()}`,
        mutationHash: "phase-5a-ten-files",
      });
      expect(result.status).toBe("ACCEPTED");
      expect(drive.state.peakConcurrentUpdates()).toBe(2);
      expect(drive.state.peakConcurrentUpdates()).toBeLessThanOrEqual(2);

      const [saga] = await bootstrapSql<
        { moved_files: Record<string, string> | string; step: string }[]
      >`select moved_files, step from public.public_acceptance_sagas where submission_id = ${record.submissionId}`;
      const movedFiles =
        typeof saga.moved_files === "string"
          ? (JSON.parse(saga.moved_files) as Record<string, string>)
          : saga.moved_files;
      // Five durable checkpoint transactions are exercised by five chunks; the helper unit test
      // asserts exact grouping because schema deliberately stores only the final map, not history.
      expect(Object.keys(movedFiles)).toHaveLength(10);
      expect(saga.step).toBe("COMPLETED");
      const officialFiles = await bootstrapSql`
          select file_id from public.files where case_id = ${result.officialCaseId}
        `;
      expect(officialFiles).toHaveLength(10);
      for (const file of fileSpecs) expect(drive.state.updateCallsFor(file.driveFileId)).toBe(1);
    }, 30_000);

    it(
      "Kịch bản 1b: GCN nhiều thửa nhiều mục đích → public.parcels và public.assets được ghi đủ, " +
        "chạy lại cùng key KHÔNG nhân đôi dòng (bằng chứng cho bản vá P0-5, 2026-07-25)",
      async () => {
        const parcels = [
          {
            id: "parcel-1",
            oldWard: "HA_THACH",
            mapSheetNumber: "12",
            parcelNumber: "144",
            addressOnCertificate: "Khu 5, Hà Thạch",
            area: "96,1",
            landUses: [
              { id: "lu-1", purposeCode: "ODT", area: "96,1" },
              { id: "lu-2", purposeCode: "CLN", area: "40,0" },
            ],
          },
          {
            id: "parcel-2",
            oldWard: "PHU_HO",
            mapSheetNumber: "7",
            parcelNumber: "58",
            addressOnCertificate: "Khu 2, Phú Hộ",
            area: "250,5",
            landUses: [{ id: "lu-3", purposeCode: "LUC", area: "250,5" }],
          },
        ];
        const assets = [{ id: "asset-1", assetType: "NHA_O", description: "Nhà cấp 4" }];
        const { record } = await seedSubmission({ parcels, assets });
        const idempotencyKey = `key-${randomUUID()}`;
        const input = { ...baseInput(record), idempotencyKey, mutationHash: "hash-parcels" };

        const result = await runOfficialAcceptance(input);
        expect(result.status).toBe("ACCEPTED");

        const parcelRows = await bootstrapSql<
          { parcel_id: string; data_json: Record<string, unknown> | string }[]
        >`select parcel_id, data_json from public.parcels where case_id = ${result.officialCaseId} order by parcel_id`;
        expect(parcelRows).toHaveLength(2);
        expect(parcelRows.map((row) => row.parcel_id)).toEqual([
          `ACC:${record.submissionId}:parcel-1`,
          `ACC:${record.submissionId}:parcel-2`,
        ]);

        // Mục đích sử dụng phải đi theo thửa vào bản chính thức, không được rơi lại trong draft_json.
        const firstParcel =
          typeof parcelRows[0].data_json === "string"
            ? (JSON.parse(parcelRows[0].data_json) as Record<string, unknown>)
            : parcelRows[0].data_json;
        expect((firstParcel.landUses as unknown[]).length).toBe(2);
        expect(firstParcel.parcelNumber).toBe("144");
        expect(firstParcel.sortOrder).toBe(0);

        const assetRows =
          await bootstrapSql`select asset_id from public.assets where case_id = ${result.officialCaseId}`;
        expect(assetRows).toHaveLength(1);

        // Replay cùng key: idempotent, không sinh dòng thứ ba.
        const replay = await runOfficialAcceptance(input);
        expect(replay.officialCaseId).toBe(result.officialCaseId);
        const parcelRowsAfterReplay = await bootstrapSql`select parcel_id from public.parcels`;
        expect(parcelRowsAfterReplay).toHaveLength(2);
      },
      30_000,
    );

    it(
      "Kịch bản 1c: làm mới hình chiếu chuẩn hóa hai lần liên tiếp không vi phạm khóa ngoại " +
        "public_land_uses → public_parcels (bằng chứng cho bản vá P0-1, 2026-07-25)",
      async () => {
        const { record } = await seedSubmission({
          parcels: [
            {
              id: "parcel-1",
              parcelIdCode: "",
              oldWard: "HA_THACH",
              mapSheetNumber: "12",
              parcelNumber: "144",
              addressOnCertificate: "Khu 5, Hà Thạch",
              addressTwoLevel: "",
              area: "96,1",
              landUses: [
                {
                  id: "lu-1",
                  purposeCode: "ODT",
                  purposeFreeText: "",
                  originCode: "NHAN_CHUYEN_QUYEN",
                  formCode: "SU_DUNG_RIENG",
                  termCode: "SU_DUNG_ON_DINH_LAU_DAI",
                  area: "96,1",
                },
              ],
            },
          ],
        });
        const repository = getPublicIntakeRepository();
        const draft = record.draft;
        if (!draft) throw new Error("Seed thiếu draft.");

        // Lần 1: bảng con còn rỗng nên thứ tự xóa sai vẫn chạy được — đây là lý do lỗi lọt qua CI.
        const first = await repository.commitStaffDraftEdit({
          record,
          expectedVersion: record.version,
          draft: { ...draft, certificate: { ...draft.certificate, registryNumber: "CS00999" } },
          actorEmail: "officer@example.com",
          auditMetadata: { "certificate.registryNumber": "CS00123 → CS00999" },
          timelineEvent: newTimelineEvent({ eventType: "STAFF_EDITED", label: "Cán bộ sửa lần 1" }),
          requestId: `req-${randomUUID()}`,
          idempotencyKey: `STAFF_EDIT:${record.submissionId}:${randomUUID()}`,
          mutationHash: "hash-edit-1",
        });
        const landUsesAfterFirst =
          await bootstrapSql`select land_use_id from public.public_land_uses where submission_id = ${record.submissionId}`;
        expect(landUsesAfterFirst).toHaveLength(1);

        // Lần 2 là lần thật sự phải xóa dữ liệu cũ. Trước bản vá, câu này ném foreign_key_violation.
        const reloaded = await repository.findById(record.submissionId);
        if (!reloaded?.draft) throw new Error("Không đọc lại được hồ sơ.");
        const second = await repository.commitStaffDraftEdit({
          record: reloaded,
          expectedVersion: first.version,
          draft: {
            ...reloaded.draft,
            certificate: { ...reloaded.draft.certificate, registryNumber: "CS01000" },
          },
          actorEmail: "officer@example.com",
          auditMetadata: { "certificate.registryNumber": "CS00999 → CS01000" },
          timelineEvent: newTimelineEvent({ eventType: "STAFF_EDITED", label: "Cán bộ sửa lần 2" }),
          requestId: `req-${randomUUID()}`,
          idempotencyKey: `STAFF_EDIT:${record.submissionId}:${randomUUID()}`,
          mutationHash: "hash-edit-2",
        });
        expect(second.version).toBeGreaterThan(first.version);

        const landUsesAfterSecond =
          await bootstrapSql`select land_use_id from public.public_land_uses where submission_id = ${record.submissionId}`;
        expect(landUsesAfterSecond).toHaveLength(1);
        const parcelsAfterSecond =
          await bootstrapSql`select parcel_id from public.public_parcels where submission_id = ${record.submissionId}`;
        expect(parcelsAfterSecond).toHaveLength(1);
      },
      30_000,
    );

    it(
      "Kịch bản 1d: điều chỉnh hồ sơ ĐÃ tiếp nhận → dữ liệu chính thức được ghi lại trong cùng " +
        "transaction, mã hồ sơ giữ nguyên (bằng chứng cho Q2, 2026-07-25)",
      async () => {
        const { record } = await seedSubmission({
          parcels: [
            {
              id: "parcel-1",
              parcelIdCode: "",
              oldWard: "HA_THACH",
              mapSheetNumber: "12",
              parcelNumber: "144",
              addressOnCertificate: "Khu 5, Hà Thạch",
              addressTwoLevel: "",
              area: "96,1",
              landUses: [
                {
                  id: "lu-1",
                  purposeCode: "ODT",
                  purposeFreeText: "",
                  originCode: "NHAN_CHUYEN_QUYEN",
                  formCode: "SU_DUNG_RIENG",
                  termCode: "SU_DUNG_ON_DINH_LAU_DAI",
                  area: "96,1",
                },
              ],
            },
            {
              id: "parcel-2",
              parcelIdCode: "",
              oldWard: "PHU_HO",
              mapSheetNumber: "7",
              parcelNumber: "58",
              addressOnCertificate: "Khu 2, Phú Hộ",
              addressTwoLevel: "",
              area: "250,5",
              landUses: [
                {
                  id: "lu-2",
                  purposeCode: "LUC",
                  purposeFreeText: "",
                  originCode: "NHAN_CHUYEN_QUYEN",
                  formCode: "SU_DUNG_RIENG",
                  termCode: "SU_DUNG_ON_DINH_LAU_DAI",
                  area: "250,5",
                },
              ],
            },
          ],
        });
        const accepted = await runOfficialAcceptance({
          ...baseInput(record),
          idempotencyKey: `key-${randomUUID()}`,
          mutationHash: "hash-before-amend",
        });
        expect(accepted.status).toBe("ACCEPTED");

        const repository = getPublicIntakeRepository();
        const afterAccept = await repository.findById(record.submissionId);
        if (!afterAccept?.draft) throw new Error("Không đọc lại được hồ sơ sau khi tiếp nhận.");

        // Cán bộ phát hiện số vào sổ ghi nhầm VÀ một thửa bị khai thừa → sửa rồi lưu điều chỉnh.
        const amendedDraft = {
          ...afterAccept.draft,
          certificate: { ...afterAccept.draft.certificate, registryNumber: "CS99999" },
          parcels: afterAccept.draft.parcels.slice(0, 1),
        };
        const amended = await repository.commitOfficialAmendment({
          record: afterAccept,
          expectedVersion: afterAccept.version,
          draft: amendedDraft,
          actorEmail: "officer@example.com",
          amendmentReason: "Đối chiếu bìa gốc: số vào sổ ghi nhầm và thửa 58 không thuộc GCN này.",
          auditMetadata: { "certificate.registryNumber": "CS00123 → CS99999" },
          timelineEvent: newTimelineEvent({
            eventType: "OFFICIAL_RECORD_AMENDED",
            label: "Cán bộ điều chỉnh hồ sơ đã tiếp nhận",
          }),
          requestId: `req-${randomUUID()}`,
          idempotencyKey: `OFFICIAL_AMENDMENT:${record.submissionId}:${randomUUID()}`,
          mutationHash: "hash-amend-1",
        });

        // Mã hồ sơ chính thức KHÔNG đổi — điều chỉnh là sửa nội dung, không phải tiếp nhận lại.
        expect(amended.officialCaseId).toBe(accepted.officialCaseId);
        expect(amended.status).toBe("ACCEPTED");
        expect(amended.version).toBeGreaterThan(afterAccept.version);
        // Snapshot hiệu lực phải đi cùng bản chính thức vừa đồng bộ. Nếu không, effectivePayload()
        // sẽ tiếp tục trả JSON cũ dù các bảng certificates/parcels đã đúng.
        expect(amended.officialPayload?.certificate.registryNumber).toBe("CS99999");
        expect(amended.officialPayloadAt).not.toBe("");
        expect(amended.officialPayloadBy).toBe("officer@example.com");

        // Bảng chính thức đã theo bản mới, không còn giá trị cũ.
        const [certificateRow] = await bootstrapSql<{ registry_number: string }[]>`
          select registry_number from public.certificates where case_id = ${accepted.officialCaseId}
        `;
        expect(certificateRow.registry_number).toBe("CS99999");

        // Thửa bị xóa khỏi bản kê khai phải biến mất khỏi hồ sơ chính thức, không để lại dòng mồ côi.
        const parcelRows = await bootstrapSql<{ parcel_id: string }[]>`
          select parcel_id from public.parcels where case_id = ${accepted.officialCaseId}
        `;
        expect(parcelRows).toHaveLength(1);
        expect(parcelRows[0].parcel_id).toBe(`ACC:${record.submissionId}:parcel-1`);

        // Vẫn đúng một hồ sơ chính thức, không sinh case thứ hai.
        const casesRows = await bootstrapSql`select case_id from public.cases`;
        expect(casesRows).toHaveLength(1);

        // Lý do điều chỉnh phải nằm trong nhật ký kiểm toán — đây là dấu vết đối soát duy nhất.
        const auditRows = await bootstrapSql<{ metadata: Record<string, unknown> | string }[]>`
          select metadata from public.audit_logs
          where entity_id = ${record.submissionId} and action = 'OFFICIAL_RECORD_AMENDED'
        `;
        expect(auditRows).toHaveLength(1);
        const auditMetadata =
          typeof auditRows[0].metadata === "string"
            ? (JSON.parse(auditRows[0].metadata) as Record<string, unknown>)
            : auditRows[0].metadata;
        expect(auditMetadata.amendmentReason).toContain("số vào sổ ghi nhầm");
        expect(auditMetadata.officialCaseId).toBe(accepted.officialCaseId);
      },
      30_000,
    );

    it(
      "Kịch bản 2a: hồ sơ đang có 1 saga dở dang (do lỗi Drive) — request khác dùng idempotency " +
        "key KHÁC bị từ chối ACCEPTANCE_IN_PROGRESS, không sinh saga/case thứ hai",
      async () => {
        const { record, fileSpecs } = await seedSubmission();
        const keyA = `key-a-${randomUUID()}`;

        drive.state.failOnFileId = fileSpecs[1].driveFileId;
        await expect(
          runOfficialAcceptance({
            ...baseInput(record),
            idempotencyKey: keyA,
            mutationHash: "hash-a",
          }),
        ).rejects.toBeInstanceOf(AcceptanceRetryableError);

        const keyB = `key-b-${randomUUID()}`;
        await expect(
          runOfficialAcceptance({
            ...baseInput(record),
            idempotencyKey: keyB,
            mutationHash: "hash-b",
          }),
        ).rejects.toBeInstanceOf(AcceptanceInProgressError);

        const sagaRows = await bootstrapSql<{ idempotency_key: string }[]>`
          select idempotency_key from public.public_acceptance_sagas where submission_id = ${record.submissionId}
        `;
        expect(sagaRows).toHaveLength(1);
        expect(sagaRows[0].idempotency_key).toBe(keyA);
        const reservationRows = await bootstrapSql`select * from public.id_reservations`;
        expect(reservationRows).toHaveLength(1);
      },
      30_000,
    );

    it(
      "Kịch bản 2b: hai request TIẾP NHẬN cùng lúc cho hồ sơ mới toanh, 2 idempotency key khác " +
        "nhau — bất biến cốt lõi: không bao giờ có 2 case_counters/id_reservations được cấp, dù " +
        "lỗi trả về (ACCEPTANCE_IN_PROGRESS hay VERSION_CONFLICT) phụ thuộc thời điểm race thật " +
        "của Postgres",
      async () => {
        const { record } = await seedSubmission();
        const results = await Promise.allSettled([
          runOfficialAcceptance({
            ...baseInput(record),
            idempotencyKey: `race-1-${randomUUID()}`,
            mutationHash: "hash-race-1",
          }),
          runOfficialAcceptance({
            ...baseInput(record),
            idempotencyKey: `race-2-${randomUUID()}`,
            mutationHash: "hash-race-2",
          }),
        ]);

        const rejected = results.filter(
          (settled): settled is PromiseRejectedResult => settled.status === "rejected",
        );
        for (const failure of rejected) {
          expect(
            failure.reason instanceof AcceptanceInProgressError ||
              failure.reason instanceof SubmissionVersionConflictError,
          ).toBe(true);
        }

        const reservationRows = await bootstrapSql`select * from public.id_reservations`;
        expect(reservationRows.length).toBeLessThanOrEqual(1);
        const casesRows = await bootstrapSql`select case_id from public.cases`;
        expect(casesRows.length).toBeLessThanOrEqual(1);
      },
      30_000,
    );

    it(
      "Kịch bản 3a: bấm lại sau khi COMPLETED (còn request_log trong 24h) → trả kết quả cache y " +
        "hệt, không tăng version, không audit/timeline trùng",
      async () => {
        const { record } = await seedSubmission();
        const idempotencyKey = `key-complete-${randomUUID()}`;
        const input = { ...baseInput(record), idempotencyKey, mutationHash: "hash-complete" };

        const first = await runOfficialAcceptance(input);
        const second = await runOfficialAcceptance(input);
        expect(second).toEqual(first);

        const [{ version }] = await bootstrapSql<{ version: number }[]>`
          select version from public.public_submissions where submission_id = ${record.submissionId}
        `;
        expect(version).toBe(first.version);

        const auditRows = await bootstrapSql`
          select 1 from public.audit_logs
          where entity_id = ${record.submissionId} and action = 'OFFICIAL_ACCEPTANCE_COMPLETED'
        `;
        expect(auditRows).toHaveLength(1);
        const timelineRows = await bootstrapSql`
          select 1 from public.public_status_events
          where submission_id = ${record.submissionId} and event_type = 'ACCEPTED'
        `;
        expect(timelineRows).toHaveLength(1);
      },
      30_000,
    );

    it(
      "Kịch bản 3b: bấm lại sau khi COMPLETED nhưng request_log đã hết hạn (giả lập sau 24h, đã " +
        "bị dọn) → vẫn trả đúng kết quả, không mutate lại, đọc thẳng từ saga step COMPLETED",
      async () => {
        const { record } = await seedSubmission();
        const idempotencyKey = `key-expired-${randomUUID()}`;
        const input = { ...baseInput(record), idempotencyKey, mutationHash: "hash-expired" };

        const first = await runOfficialAcceptance(input);
        await bootstrapSql`delete from public.request_log where idempotency_key = ${idempotencyKey}`;

        const second = await runOfficialAcceptance(input);
        expect(second.officialCaseId).toBe(first.officialCaseId);
        expect(second.status).toBe("ACCEPTED");
        expect(second.version).toBe(first.version);

        const [{ step }] = await bootstrapSql<{ step: string }[]>`
          select step from public.public_acceptance_sagas where submission_id = ${record.submissionId}
        `;
        expect(step).toBe("COMPLETED");
      },
      30_000,
    );

    it(
      "Kịch bản 3c: dùng lại idempotency key cũ nhưng đổi payload (mutation hash khác) → bị từ " +
        "chối IDEMPOTENCY_CONFLICT, không cho phép ghi dữ liệu khác dưới cùng một key",
      async () => {
        const { record } = await seedSubmission();
        const idempotencyKey = `key-conflict-${randomUUID()}`;

        await runOfficialAcceptance({
          ...baseInput(record),
          idempotencyKey,
          mutationHash: "original-hash",
        });

        await expect(
          runOfficialAcceptance({
            ...baseInput(record),
            idempotencyKey,
            mutationHash: "different-hash",
          }),
        ).rejects.toBeInstanceOf(SubmissionIdempotencyConflictError);
      },
      30_000,
    );
  },
);
