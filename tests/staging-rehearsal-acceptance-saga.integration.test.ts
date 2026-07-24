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

import { readFileSync } from "node:fs";
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

  const state = {
    /** Ném lỗi mạng giả khi `drive.files.update` được gọi cho đúng fileId này. */
    failOnFileId: null as string | null,
    reset() {
      nodes.clear();
      seq = 0;
      callsByFile.clear();
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
        (node) => node.mimeType === FOLDER_MIME && node.name === name && node.parents.includes(parentId),
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
      if (state.failOnFileId === fileId) {
        throw new Error("fake drive: mô phỏng mất mạng giữa chừng khi di chuyển file");
      }
      const node = nodes.get(fileId);
      if (!node) throw new Error(`fake drive: không tìm thấy file ${fileId}`);
      const removeSet = new Set((removeParents ?? "").split(",").filter(Boolean));
      node.parents = node.parents.filter((parentId) => !removeSet.has(parentId));
      if (addParents) node.parents.push(addParents);
      return { data: { id: node.id, parents: [...node.parents] } };
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

const MIGRATION_FILES = [
  "supabase/migrations/202607230001_supabase_schema.sql",
  "supabase/migrations/202607240001_official_acceptance.sql",
];

const REPO_ROOT = join(__dirname, "..");

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
  if (alreadyApplied[0]?.exists) return;

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

    /** Mỗi hồ sơ có 3 file (2 CCCD + 1 GCN) sẵn sàng để saga di chuyển. */
    async function seedSubmission() {
      const submissionId = `sub-${randomUUID()}`;
      const receiptCode = `PC-KK-2026-${randomUUID().slice(0, 8).toUpperCase()}`;
      const draft = {
        phone: "0912345678",
        owners: [
          {
            id: "owner-1",
            fullName: "Nguyễn Văn A",
            identityNumber: "012345678901",
            dateOfBirth: "1990-01-01",
            gender: "Nam",
            residenceAddress: "Tổ dân phố Hà Thạch",
            identitySource: "MANUAL",
          },
        ],
        parcels: [{ id: "parcel-1", oldWard: "HA_THACH" }],
        certificate: {
          issueNumber: "AB123456",
          issueDate: "2020-01-01",
          registryNumber: "CS00123",
        },
        assets: [],
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

      const fileSpecs = [
        { fileId: `file-${randomUUID()}`, driveFileId: `drive-front-${randomUUID()}`, documentType: "CITIZEN_ID_FRONT", ownerId: "owner-1" },
        { fileId: `file-${randomUUID()}`, driveFileId: `drive-back-${randomUUID()}`, documentType: "CITIZEN_ID_BACK", ownerId: "owner-1" },
        { fileId: `file-${randomUUID()}`, driveFileId: `drive-cert-${randomUUID()}`, documentType: "CERTIFICATE", ownerId: "" },
      ] as const;

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

        const [sagaAfterCrash] = await bootstrapSql<{ moved_files: Record<string, string> | string; step: string }[]>`
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

    it(
      "Kịch bản 2a: hồ sơ đang có 1 saga dở dang (do lỗi Drive) — request khác dùng idempotency " +
        "key KHÁC bị từ chối ACCEPTANCE_IN_PROGRESS, không sinh saga/case thứ hai",
      async () => {
        const { record, fileSpecs } = await seedSubmission();
        const keyA = `key-a-${randomUUID()}`;

        drive.state.failOnFileId = fileSpecs[1].driveFileId;
        await expect(
          runOfficialAcceptance({ ...baseInput(record), idempotencyKey: keyA, mutationHash: "hash-a" }),
        ).rejects.toBeInstanceOf(AcceptanceRetryableError);

        const keyB = `key-b-${randomUUID()}`;
        await expect(
          runOfficialAcceptance({ ...baseInput(record), idempotencyKey: keyB, mutationHash: "hash-b" }),
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
