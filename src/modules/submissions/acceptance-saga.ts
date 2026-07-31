import type { Sql } from "postgres";

import { loadGoogleStorageEnvironment } from "@/modules/common/env";
import { createGoogleWorkspaceClient } from "@/modules/google/workspace-client";
import { buildOriginalFileNames } from "@/modules/public-intake/file-naming";
import {
  getPublicIntakeRepository,
  SubmissionIdempotencyConflictError,
  SubmissionRecord,
  SubmissionVersionConflictError,
} from "@/modules/public-intake/repository";
import { getPublicIntakeStorage } from "@/modules/public-intake/storage";
import { newTimelineEvent } from "@/modules/public-intake/workflow";
import { effectivePayload } from "@/modules/public-intake/payload-layers";
import { syncOfficialRecord } from "@/modules/submissions/official-record";
import { getDatabase } from "@/modules/supabase/database";
import {
  chunkOfficialAcceptanceFiles,
  settleOfficialAcceptanceMoveChunk,
} from "./acceptance-file-move";
import {
  canStartOfficialAcceptance,
  formatOfficialCaseId,
  vietnamBusinessYear,
} from "./acceptance";

export class AcceptanceRetryableError extends Error {
  constructor(
    message = "Tiếp nhận chưa hoàn tất, hãy thử lại — hệ thống sẽ tiếp tục từ bước đã lưu.",
  ) {
    super(message);
    this.name = "AcceptanceRetryableError";
  }
}

export class AcceptanceInProgressError extends Error {
  constructor(message = "Hồ sơ đang được tiếp nhận bởi một phiên khác.") {
    super(message);
    this.name = "AcceptanceInProgressError";
  }
}

export class AcceptanceNotAllowedError extends Error {
  constructor(message = "Hồ sơ không đủ điều kiện tiếp nhận chính thức.") {
    super(message);
    this.name = "AcceptanceNotAllowedError";
  }
}

export interface AcceptanceInput {
  readonly record: SubmissionRecord;
  readonly expectedVersion: number;
  readonly actorEmail: string;
  readonly actorDisplayName: string;
  readonly isAdministrator: boolean;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly mutationHash: string;
}

export interface AcceptanceResult {
  readonly officialCaseId: string;
  readonly status: "ACCEPTED";
  readonly version: number;
}

export interface SagaRow {
  submission_id: string;
  idempotency_key: string;
  step: string;
  official_case_id: string;
  case_folder_id: string;
  originals_folder_id: string;
  moved_files: Record<string, string>;
  last_error: string;
  actor_email: string;
}

const STEP_ORDER: Record<string, number> = {
  CLAIMED: 1,
  ID_RESERVED: 2,
  CASE_FOLDER_READY: 3,
  FILES_MOVED: 4,
  RECORDS_WRITTEN: 5,
  COMPLETED: 6,
};

/**
 * Supavisor transaction-mode pooler (`prepare: false`) đôi khi trả cột `jsonb` về dạng chuỗi JSON
 * thô thay vì object đã parse — cùng hiện tượng `decodeSubmissionDraft` (repository.ts) đã phải
 * xử lý phòng thủ cho `draft_json`. Phát hiện qua diễn tập staging thật trên Postgres thật (không
 * phải mock) 2026-07-24: nếu không chuẩn hóa, `moved_files` bị spread thành object theo ký tự
 * (`{...'{"a":"b"}'}` → `{0:'{',1:'"',...}`), và `response_json` trả thẳng ra ngoài dưới dạng
 * chuỗi thay vì `AcceptanceResult`, khiến `result.officialCaseId` là `undefined` phía client.
 */
function parseJsonbMaybeString<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function mapSagaRow(row: SagaRow): SagaRow {
  return { ...row, moved_files: parseJsonbMaybeString<Record<string, string>>(row.moved_files) };
}

async function getLatestSaga(sql: Sql, submissionId: string): Promise<SagaRow | undefined> {
  const rows = await sql<SagaRow[]>`
    select submission_id, idempotency_key, step, official_case_id, case_folder_id,
      originals_folder_id, moved_files, last_error, actor_email
    from public.public_acceptance_sagas
    where submission_id = ${submissionId}
  `;
  return rows[0] ? mapSagaRow(rows[0]) : undefined;
}

/**
 * Saga tiếp nhận chính thức (resumable).
 * Tách biệt hoàn toàn các thao tác mạng Google Drive và các hàm repository dùng pool riêng
 * khỏi transaction Database để phòng tránh deadlock trong môi trường connection pool max: 1.
 */
export async function runOfficialAcceptance(input: AcceptanceInput): Promise<AcceptanceResult> {
  if (!input.record.driveFolderId) {
    throw new AcceptanceNotAllowedError(
      "Bản kê khai chưa có thư mục ảnh sẵn sàng để tiếp nhận chính thức.",
    );
  }

  const database = getDatabase();
  const repository = getPublicIntakeRepository();
  const storage = getPublicIntakeStorage();
  const environment = loadGoogleStorageEnvironment();

  // BƯỚC 0: Mở / Tải Saga Checkpoint (Transaction #1)
  const saga = await database.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;

    const cachedLog = await transaction<
      { response_json: AcceptanceResult; mutation_hash: string }[]
    >`
      select response_json, mutation_hash from public.request_log where idempotency_key = ${input.idempotencyKey}
    `;
    if (cachedLog[0]) {
      if (cachedLog[0].mutation_hash !== input.mutationHash) {
        throw new SubmissionIdempotencyConflictError();
      }
      return {
        cachedResult: parseJsonbMaybeString<AcceptanceResult>(cachedLog[0].response_json),
        saga: null,
      };
    }

    const existingSaga = await getLatestSaga(transaction, input.record.submissionId);
    if (existingSaga) {
      if (existingSaga.idempotency_key !== input.idempotencyKey) {
        throw new AcceptanceInProgressError();
      }
      return { cachedResult: null, saga: existingSaga };
    }

    if (input.record.status === "ACCEPTING") {
      throw new AcceptanceNotAllowedError(
        "Trạng thái tiếp nhận không nhất quán, liên hệ quản trị viên.",
      );
    }

    if (!canStartOfficialAcceptance(input.record, input.actorEmail, input.isAdministrator)) {
      throw new AcceptanceNotAllowedError(
        "Hồ sơ phải đang được bạn nhận xử lý, ở trạng thái đang xử lý và chưa có mã hồ sơ chính thức.",
      );
    }

    const updateRows = await transaction`
      update public.public_submissions
      set status = 'ACCEPTING', accept_step = 'CLAIMED', version = version + 1, updated_at = now()
      where submission_id = ${input.record.submissionId} and version = ${input.expectedVersion}
      returning version
    `;
    if (!updateRows[0]) {
      throw new SubmissionVersionConflictError();
    }

    const newSagaRows = await transaction<SagaRow[]>`
      insert into public.public_acceptance_sagas (
        submission_id, idempotency_key, step, actor_email
      ) values (
        ${input.record.submissionId}, ${input.idempotencyKey}, 'CLAIMED', ${input.actorEmail}
      )
      returning submission_id, idempotency_key, step, official_case_id, case_folder_id,
        originals_folder_id, moved_files, last_error, actor_email
    `;

    await repository.insertAudit(transaction, {
      actorEmail: input.actorEmail,
      action: "OFFICIAL_ACCEPTANCE_STARTED",
      entityId: input.record.submissionId,
      requestId: input.requestId,
    });

    await repository.insertTimeline(
      transaction,
      input.record.submissionId,
      newTimelineEvent({
        eventType: "ACCEPTING",
        actorDisplayName: input.actorDisplayName,
        label: "Đang lập hồ sơ chính thức",
        message: "Hệ thống đang thực hiện tiếp nhận và phân loại hồ sơ.",
      }),
      input.actorEmail,
      input.requestId,
    );

    return { cachedResult: null, saga: mapSagaRow(newSagaRows[0]) };
  });

  if (saga.cachedResult) {
    return saga.cachedResult;
  }

  let currentSaga = saga.saga!;

  // BƯỚC ID_RESERVED: Cấp mã case ID nguyên tử (Transaction #2)
  if (currentSaga.step === "CLAIMED") {
    currentSaga = await database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;

      const reCheck = await getLatestSaga(transaction, input.record.submissionId);
      if (reCheck && (STEP_ORDER[reCheck.step] ?? 0) > STEP_ORDER.CLAIMED) {
        return reCheck;
      }

      const existingRes = await transaction<{ official_case_id: string }[]>`
        select official_case_id from public.id_reservations where request_id = ${input.idempotencyKey}
      `;

      let officialCaseId = existingRes[0]?.official_case_id;

      if (!officialCaseId) {
        const yearStr = vietnamBusinessYear(new Date());
        const yearInt = parseInt(yearStr, 10);

        const counterRows = await transaction<{ last_sequence: number }[]>`
          insert into public.case_counters (year, last_sequence)
          values (${yearInt}, 1)
          on conflict (year) do update set last_sequence = public.case_counters.last_sequence + 1
          returning last_sequence
        `;
        const seq = counterRows[0].last_sequence;
        officialCaseId = formatOfficialCaseId(yearStr, seq);

        await transaction`
          insert into public.id_reservations (
            year, sequence_number, official_case_id, submission_id, request_id, actor_email
          ) values (
            ${yearInt}, ${seq}, ${officialCaseId}, ${input.record.submissionId},
            ${input.idempotencyKey}, ${input.actorEmail}
          )
        `;
      }

      const updatedSaga = await transaction<SagaRow[]>`
        update public.public_acceptance_sagas
        set step = 'ID_RESERVED', official_case_id = ${officialCaseId}, updated_at = now()
        where submission_id = ${input.record.submissionId}
        returning submission_id, idempotency_key, step, official_case_id, case_folder_id,
          originals_folder_id, moved_files, last_error, actor_email
      `;

      await transaction`
        update public.public_submissions
        set accept_step = 'ID_RESERVED', updated_at = now()
        where submission_id = ${input.record.submissionId}
      `;

      return mapSagaRow(updatedSaga[0]);
    });
  }

  // BƯỚC CASE_FOLDER_READY: Tạo thư mục Drive (NGOÀI DB Transaction)
  if (currentSaga.step === "ID_RESERVED") {
    try {
      const draft = input.record.draft;
      const tdpCode = draft?.parcels?.[0]?.oldWard || "CHUA_PHAN_LOAI";
      const rootCasesId = await storage.findOrCreateFolder(
        "02_CASES",
        environment.GOOGLE_MY_DRIVE_ROOT_FOLDER_ID,
      );
      const tdpFolderId = await storage.findOrCreateFolder(tdpCode, rootCasesId);
      const caseFolderId = await storage.findOrCreateFolder(
        currentSaga.official_case_id,
        tdpFolderId,
      );
      const originalsFolderId = await storage.findOrCreateFolder("originals", caseFolderId);

      currentSaga = await database.begin(async (transaction) => {
        await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;

        const reCheck = await getLatestSaga(transaction, input.record.submissionId);
        if (reCheck && (STEP_ORDER[reCheck.step] ?? 0) > STEP_ORDER.ID_RESERVED) {
          return reCheck;
        }

        const updated = await transaction<SagaRow[]>`
          update public.public_acceptance_sagas
          set step = 'CASE_FOLDER_READY', case_folder_id = ${caseFolderId},
            originals_folder_id = ${originalsFolderId}, updated_at = now()
          where submission_id = ${input.record.submissionId}
          returning submission_id, idempotency_key, step, official_case_id, case_folder_id,
            originals_folder_id, moved_files, last_error, actor_email
        `;
        await transaction`
          update public.public_submissions
          set accept_step = 'CASE_FOLDER_READY', updated_at = now()
          where submission_id = ${input.record.submissionId}
        `;
        return mapSagaRow(updated[0]);
      });
    } catch (error) {
      throw new AcceptanceRetryableError(
        `Lỗi tạo thư mục lưu trữ: ${error instanceof Error ? error.message : "Thất bại"}`,
      );
    }
  }

  // BƯỚC FILES_MOVED: Di chuyển file trên Drive (ngoài DB transaction, tối đa 2 file/nhóm)
  if (currentSaga.step === "CASE_FOLDER_READY") {
    try {
      const activeFiles = await repository.listFiles(input.record.submissionId);
      const credentials = {
        clientId: environment.GOOGLE_DRIVE_CLIENT_ID,
        clientSecret: environment.GOOGLE_DRIVE_CLIENT_SECRET,
        refreshToken: environment.GOOGLE_DRIVE_REFRESH_TOKEN,
      };
      const { drive } = createGoogleWorkspaceClient(credentials);

      // Đổi tên đúng quy ước PL3 trường 49 (cùng hàm với `pl3-export.ts`, không lệch nhau). STT
      // tính trên `activeFiles` — thứ tự này khớp `repository.listFiles` (created_at, file_id).
      const originalFileNames = buildOriginalFileNames(
        input.record.draft?.certificate?.issueNumber ?? "",
        activeFiles.map((file) => ({ documentType: file.documentType, mimeType: file.mimeType })),
      );

      const movedMap: Record<string, string> = { ...(currentSaga.moved_files || {}) };
      const pendingFiles = activeFiles
        .map((file, index) => ({ file, index }))
        .filter(({ file }) => !movedMap[file.fileId]);

      for (const chunk of chunkOfficialAcceptanceFiles(pendingFiles)) {
        const settled = await settleOfficialAcceptanceMoveChunk(chunk, async ({ file, index }) => {
          const metadata = await drive.files.get({
            fileId: file.driveFileId,
            fields: "id,parents",
          });
          const currentParents = metadata.data.parents || [];
          const needsMove = !currentParents.includes(currentSaga.originals_folder_id);
          const newName = originalFileNames[index];

          if (needsMove || newName) {
            const removeParents = currentParents.join(",");
            await drive.files.update({
              fileId: file.driveFileId,
              addParents: needsMove ? currentSaga.originals_folder_id : undefined,
              removeParents: needsMove ? removeParents || undefined : undefined,
              requestBody: newName ? { name: newName } : undefined,
              fields: "id,parents,name",
            });
          }
        });

        if (settled.succeeded.length > 0) {
          const completedMoves = settled.succeeded.map(({ file }) => ({
            fileId: file.fileId,
            driveFileId: file.driveFileId,
          }));
          currentSaga = await database.begin(async (transaction) => {
            await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
            const reCheck = await getLatestSaga(transaction, input.record.submissionId);
            if (reCheck && (STEP_ORDER[reCheck.step] ?? 0) > STEP_ORDER.CASE_FOLDER_READY) {
              return reCheck;
            }
            const nextMovedMap = { ...(reCheck?.moved_files || {}) };
            for (const completedMove of completedMoves) {
              nextMovedMap[completedMove.fileId] = completedMove.driveFileId;
            }
            const updated = await transaction<SagaRow[]>`
              update public.public_acceptance_sagas
              set moved_files = ${JSON.stringify(nextMovedMap)}::jsonb, updated_at = now()
              where submission_id = ${input.record.submissionId}
              returning submission_id, idempotency_key, step, official_case_id, case_folder_id,
                originals_folder_id, moved_files, last_error, actor_email
            `;
            return mapSagaRow(updated[0]);
          });
          Object.assign(movedMap, currentSaga.moved_files || {});
        }

        if (settled.failure !== null) throw settled.failure;
        if ((STEP_ORDER[currentSaga.step] ?? 0) > STEP_ORDER.CASE_FOLDER_READY) break;
      }

      if (currentSaga.step === "CASE_FOLDER_READY") {
        currentSaga = await database.begin(async (transaction) => {
          await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
          const reCheck = await getLatestSaga(transaction, input.record.submissionId);
          if (reCheck && (STEP_ORDER[reCheck.step] ?? 0) > STEP_ORDER.CASE_FOLDER_READY) {
            return reCheck;
          }
          const updated = await transaction<SagaRow[]>`
            update public.public_acceptance_sagas
            set step = 'FILES_MOVED', updated_at = now()
            where submission_id = ${input.record.submissionId}
            returning submission_id, idempotency_key, step, official_case_id, case_folder_id,
              originals_folder_id, moved_files, last_error, actor_email
          `;
          await transaction`
            update public.public_submissions
            set accept_step = 'FILES_MOVED', updated_at = now()
            where submission_id = ${input.record.submissionId}
          `;
          return mapSagaRow(updated[0]);
        });
      }
    } catch (error) {
      throw new AcceptanceRetryableError(
        `Lỗi di chuyển tệp hồ sơ: ${error instanceof Error ? error.message : "Thất bại"}`,
      );
    }
  }

  // BƯỚC RECORDS_WRITTEN: Ghi dữ liệu chính thức vào Supabase (Transaction #3)
  if (currentSaga.step === "FILES_MOVED") {
    // Gọi listFiles TRƯỚC transaction #3 để không bị deadlock connection pool max: 1
    const activeFiles = await repository.listFiles(input.record.submissionId);

    currentSaga = await database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;

      const reCheck = await getLatestSaga(transaction, input.record.submissionId);
      if (reCheck && (STEP_ORDER[reCheck.step] ?? 0) > STEP_ORDER.FILES_MOVED) {
        return reCheck;
      }

      const draft = input.record.draft;
      const tdpCode = draft?.parcels?.[0]?.oldWard || "CHUA_PHAN_LOAI";
      const notes = draft?.certificate?.registryNumber || "";

      // 1. Insert public.cases (idempotent - đúng schema 202607230001_supabase_schema.sql)
      await transaction`
        insert into public.cases (
          case_id, neighborhood_code, neighborhood_name, status, drive_folder_id, intake_officer_email, notes
        ) values (
          ${currentSaga.official_case_id}, ${tdpCode}, ${tdpCode}, 'PENDING_REVIEW',
          ${currentSaga.case_folder_id}, ${input.actorEmail}, ${notes}
        ) on conflict (case_id) do nothing
      `;

      // 2-4. Ghi chủ sử dụng, giấy chứng nhận, thửa đất và tài sản.
      //
      // Dùng chung `syncOfficialRecord` với đường điều chỉnh hồ sơ đã tiếp nhận
      // (`commitOfficialAmendment`), để hai đường không bao giờ định nghĩa "dữ liệu chính thức"
      // khác nhau. Hàm là upsert + xóa bản ghi không còn trong bản kê khai, nên chạy lại vẫn cho
      // đúng một kết quả — giữ nguyên tính idempotent mà saga cần.
      const counts = await syncOfficialRecord(transaction, {
        caseId: currentSaga.official_case_id,
        submissionId: input.record.submissionId,
        draft,
      });

      // 5. Insert public.files (idempotent - đúng schema: checksum_sha256)
      for (const file of activeFiles) {
        const deterministicFileId = `ACC:${input.record.submissionId}:${file.fileId}`;
        const deterministicOwnerId = file.ownerId
          ? `ACC:${input.record.submissionId}:${file.ownerId}`
          : null;
        await transaction`
          insert into public.files (
            file_id, case_id, owner_id, document_type, variant, drive_file_id,
            mime_type, size_bytes, checksum_sha256, status
          ) values (
            ${deterministicFileId}, ${currentSaga.official_case_id}, ${deterministicOwnerId},
            ${file.documentType}, 'ORIGINAL', ${file.driveFileId}, ${file.mimeType},
            ${file.sizeBytes}, ${file.checksum}, 'UPLOADED'
          ) on conflict (file_id) do nothing
        `;
      }

      const updated = await transaction<SagaRow[]>`
        update public.public_acceptance_sagas
        set step = 'RECORDS_WRITTEN', updated_at = now()
        where submission_id = ${input.record.submissionId}
        returning submission_id, idempotency_key, step, official_case_id, case_folder_id,
          originals_folder_id, moved_files, last_error, actor_email
      `;
      await transaction`
        update public.public_submissions
        set accept_step = 'RECORDS_WRITTEN', updated_at = now()
        where submission_id = ${input.record.submissionId}
      `;

      await repository.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: "OFFICIAL_ACCEPTANCE_RECORDS_WRITTEN",
        entityId: input.record.submissionId,
        requestId: input.requestId,
        // Chỉ đếm, không ghi giá trị — audit_logs là append-only, không để PII lọt vào.
        metadata: {
          officialCaseId: currentSaga.official_case_id,
          ownerCount: counts.ownerCount,
          parcelCount: counts.parcelCount,
          assetCount: counts.assetCount,
          fileCount: activeFiles.length,
        },
      });

      return mapSagaRow(updated[0]);
    });
  }

  // BƯỚC COMPLETED: Hoàn tất tiếp nhận (Transaction #4 - bọc guard theo step)
  if (currentSaga.step === "RECORDS_WRITTEN") {
    const finalResult = await database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;

      const reCheck = await getLatestSaga(transaction, input.record.submissionId);
      if (reCheck && reCheck.step === "COMPLETED") {
        const sub = await transaction<{ version: number }[]>`
          select version from public.public_submissions where submission_id = ${input.record.submissionId}
        `;
        return {
          officialCaseId: reCheck.official_case_id,
          status: "ACCEPTED" as const,
          version: sub[0]?.version ?? input.expectedVersion + 1,
        };
      }

      const effPayload = effectivePayload(input.record);
      const updatedSub = await transaction<{ version: number }[]>`
        update public.public_submissions
        set status = 'ACCEPTED',
            official_case_id = ${currentSaga.official_case_id},
            official_payload_json = ${JSON.stringify(effPayload)}::jsonb,
            official_payload_at = now(),
            official_payload_by = ${input.actorEmail},
            accept_step = 'COMPLETED',
            version = version + 1,
            updated_at = now()
        where submission_id = ${input.record.submissionId}
        returning version
      `;

      await transaction`
        insert into public.public_submission_payload_history
          (submission_id, layer, payload_version, payload_json, actor_email)
        values (
          ${input.record.submissionId}, 'OFFICIAL', ${updatedSub[0].version},
          ${JSON.stringify(effPayload)}::jsonb, ${input.actorEmail}
        )
        on conflict (submission_id, layer, payload_version) do nothing
      `;

      await transaction`
        update public.public_acceptance_sagas
        set step = 'COMPLETED', updated_at = now()
        where submission_id = ${input.record.submissionId}
      `;

      const result: AcceptanceResult = {
        officialCaseId: currentSaga.official_case_id,
        status: "ACCEPTED",
        version: updatedSub[0].version,
      };

      await repository.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: "OFFICIAL_ACCEPTANCE_COMPLETED",
        entityId: input.record.submissionId,
        requestId: input.requestId,
        metadata: { officialCaseId: currentSaga.official_case_id },
      });

      await repository.insertTimeline(
        transaction,
        input.record.submissionId,
        newTimelineEvent({
          eventType: "ACCEPTED",
          actorDisplayName: input.actorDisplayName,
          label: "Đã tiếp nhận chính thức",
          message: `Hồ sơ đã được chuyển thành hồ sơ chính thức mã ${currentSaga.official_case_id}.`,
        }),
        input.actorEmail,
        input.requestId,
      );

      await transaction`
        insert into public.request_log (
          idempotency_key, kind, request_id, mutation_hash, response_json, expires_at
        ) values (
          ${input.idempotencyKey}, 'OFFICIAL_ACCEPT', ${input.requestId},
          ${input.mutationHash}, ${JSON.stringify(result)}::jsonb, now() + interval '24 hours'
        )
      `;

      return result;
    });

    return finalResult;
  }

  if (currentSaga.step === "COMPLETED") {
    const sub = await database<{ version: number }[]>`
      select version from public.public_submissions where submission_id = ${input.record.submissionId}
    `;
    return {
      officialCaseId: currentSaga.official_case_id,
      status: "ACCEPTED",
      version: sub[0]?.version ?? input.expectedVersion + 1,
    };
  }

  throw new Error(`Trạng thái saga không hợp lệ: ${currentSaga.step}`);
}
