import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

// `official-record.ts` chỉ phụ thuộc `./types`, không phụ thuộc repository — không tạo vòng import.
import { syncOfficialRecord } from "@/modules/submissions/official-record";
import { enqueueAiDraftForSubmission } from "@/modules/ai-extraction/repository";
import { getDatabase } from "@/modules/supabase/database";

import type { IntakeDraft } from "./types";
import {
  type PublicFileSummary,
  type PublicStatus,
  type PublicTimelineEvent,
  type SupplementItem,
  type SupplementRequest,
} from "./workflow";

export { PUBLIC_STATUSES } from "./workflow";
export type { PublicStatus } from "./workflow";

export interface SubmissionRecord {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly status: PublicStatus;
  readonly phone: string;
  readonly version: number;
  readonly accessCodeHash: string;
  readonly failedAttempts: number;
  readonly lockedUntil: string;
  readonly consentVersion: string;
  readonly consentedAt: string;
  readonly retentionUntil: string;
  readonly driveFolderId: string;
  readonly officialCaseId: string;
  readonly acceptStep: string;
  readonly claimedBy: string;
  readonly claimedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly draft: IntakeDraft | null;
  readonly citizenPayload?: IntakeDraft | null;
  readonly citizenPayloadVersion?: number;
  readonly citizenPayloadAt?: string;
  readonly workingPayload?: IntakeDraft | null;
  readonly workingPayloadAt?: string;
  readonly workingPayloadBy?: string;
  readonly officialPayload?: IntakeDraft | null;
  readonly officialPayloadAt?: string;
  readonly officialPayloadBy?: string;
  readonly accessVersion: number;
  readonly fileSummaries: readonly PublicFileSummary[];
  /** Locator ổn định, giữ tên cũ để cookie phiên v2 tiếp tục tương thích sau migration. */
  readonly rowIndex: number;
}

export interface SubmissionSummary {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly status: PublicStatus;
  readonly phone: string;
  readonly version: number;
  readonly claimedBy: string;
  readonly updatedAt: string;
  readonly rowIndex: number;
}

export interface StoredFile {
  readonly fileId: string;
  readonly submissionId: string;
  readonly ownerId: string;
  readonly documentType: "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
  readonly driveFileId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly fileName: string;
  readonly status: "UPLOADED" | "REPLACED" | "DELETED";
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface StoredCreationRequest {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly mutationHash: string;
}

export interface ExistingCertificateMatch {
  readonly existingRecordId: string;
  readonly issueNumber: string;
  readonly issueDate: string;
  readonly registryNumber: string;
}

export interface StoredSubmissionMutation {
  readonly kind: string;
  readonly mutationHash: string;
  readonly response: Record<string, string | number | null | string[]>;
}

export interface ExportJobRecord {
  readonly exportJobId: string;
  readonly exportType: string;
  readonly status: "COMPLETED" | "ARCHIVE_FAILED";
  readonly driveFileId: string;
  readonly fileName: string;
  readonly rowCount: number;
  readonly submissionCount: number;
  readonly warningCount: number;
  readonly checksumSha256: string;
  readonly actorEmail: string;
  readonly scopeJson: string;
  readonly createdAt: string;
  readonly completedAt: string;
}

interface SubmissionRow {
  readonly submission_id: string;
  readonly receipt_code: string;
  readonly status: PublicStatus;
  readonly phone: string;
  readonly version: number;
  readonly access_code_hash: string;
  readonly failed_attempts: number;
  readonly locked_until: Date | null;
  readonly consent_version: string;
  readonly consented_at: Date;
  readonly retention_until: Date | null;
  readonly official_case_id: string | null;
  readonly drive_folder_id: string;
  readonly accept_step: string | null;
  readonly claimed_by: string | null;
  readonly claimed_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly draft_json: unknown;
  readonly citizen_payload_json: unknown;
  readonly citizen_payload_version: number | null;
  readonly citizen_payload_at: Date | null;
  readonly working_payload_json: unknown;
  readonly working_payload_at: Date | null;
  readonly working_payload_by: string | null;
  readonly official_payload_json?: unknown;
  readonly official_payload_at?: Date | null;
  readonly official_payload_by?: string | null;
  readonly access_version: number;
  readonly file_summary_json: PublicFileSummary[] | null;
  readonly legacy_row_index: string | number;
}

interface FileRow {
  readonly file_id: string;
  readonly submission_id: string;
  readonly owner_id: string;
  readonly document_type: StoredFile["documentType"];
  readonly drive_file_id: string;
  readonly mime_type: string;
  readonly size_bytes: string | number;
  readonly checksum_sha256: string;
  readonly file_name: string;
  readonly status: StoredFile["status"];
  readonly created_at: Date;
  readonly updated_at: Date;
}

const SUBMISSION_SELECT = `
  submission_id, receipt_code::text, status, phone, version, access_code_hash,
  failed_attempts, locked_until, consent_version, consented_at, retention_until,
  official_case_id, drive_folder_id, accept_step, claimed_by, claimed_at,
  created_at, updated_at, draft_json, access_version, file_summary_json, legacy_row_index,
  citizen_payload_json, citizen_payload_version, citizen_payload_at,
  working_payload_json, working_payload_at, working_payload_by,
  official_payload_json, official_payload_at, official_payload_by
`;

function asIso(value: Date | null | undefined): string {
  return value ? value.toISOString() : "";
}

/**
 * Một số dòng legacy từng lưu `draft_json` hai lần nên PostgreSQL trả về chuỗi JSON thay vì object.
 * Đọc tương thích để người dân không bị chặn trước khi migration chuẩn hóa dữ liệu; dữ liệu hỏng
 * thực sự vẫn được trả `null` để các route từ chối an toàn.
 */
export function decodeSubmissionDraft(value: unknown): IntakeDraft | null {
  let draft = value;
  if (typeof draft === "string") {
    try {
      draft = JSON.parse(draft) as unknown;
    } catch {
      return null;
    }
  }
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  return draft as IntakeDraft;
}

/**
 * Tương tự `decodeSubmissionDraft`, đọc phòng thủ `file_summary_json` từ database Supavisor
 * khi nó bị trả về dạng chuỗi JSON thay vì mảng.
 */
export function decodeFileSummaries(value: unknown): PublicFileSummary[] {
  let summaries = value;
  if (typeof summaries === "string") {
    try {
      summaries = JSON.parse(summaries) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(summaries)) return [];
  return summaries as PublicFileSummary[];
}

function mapSubmission(row: SubmissionRow): SubmissionRecord {
  return {
    submissionId: row.submission_id,
    receiptCode: row.receipt_code,
    status: row.status,
    phone: row.phone,
    version: row.version,
    accessCodeHash: row.access_code_hash,
    failedAttempts: row.failed_attempts,
    lockedUntil: asIso(row.locked_until),
    consentVersion: row.consent_version,
    consentedAt: asIso(row.consented_at),
    retentionUntil: asIso(row.retention_until),
    driveFolderId: row.drive_folder_id,
    officialCaseId: row.official_case_id ?? "",
    acceptStep: row.accept_step ?? "",
    claimedBy: row.claimed_by ?? "",
    claimedAt: asIso(row.claimed_at),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    draft: decodeSubmissionDraft(row.draft_json),
    citizenPayload: decodeSubmissionDraft(row.citizen_payload_json),
    citizenPayloadVersion: Number(row.citizen_payload_version ?? 0),
    citizenPayloadAt: asIso(row.citizen_payload_at),
    workingPayload: decodeSubmissionDraft(row.working_payload_json),
    workingPayloadAt: asIso(row.working_payload_at),
    workingPayloadBy: row.working_payload_by ?? "",
    officialPayload: decodeSubmissionDraft(row.official_payload_json),
    officialPayloadAt: asIso(row.official_payload_at),
    officialPayloadBy: row.official_payload_by ?? "",
    accessVersion: row.access_version,
    fileSummaries: decodeFileSummaries(row.file_summary_json),
    rowIndex: Number(row.legacy_row_index),
  };
}

function mapFile(row: FileRow): StoredFile {
  return {
    fileId: row.file_id,
    submissionId: row.submission_id,
    ownerId: row.owner_id,
    documentType: row.document_type,
    driveFileId: row.drive_file_id,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    checksum: row.checksum_sha256,
    fileName: row.file_name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function safeResponse(value: unknown): Record<string, string | number | null | string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | number | null | string[]] =>
        entry[1] === null ||
        typeof entry[1] === "string" ||
        typeof entry[1] === "number" ||
        (Array.isArray(entry[1]) && entry[1].every((item) => typeof item === "string")),
    ),
  );
}

export class PublicIntakeRepository {
  readonly provider = "supabase-postgres" as const;

  async create(input: {
    submissionId: string;
    receiptCode: string;
    accessCodeHash: string;
    idempotencyKey: string;
    mutationHash: string;
    requestId: string;
    phone: string;
    driveFolderId: string;
    draft: IntakeDraft;
    consentVersion: string;
  }): Promise<void> {
    const database = getDatabase();
    await database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string }[]>`
        select mutation_hash from public.request_log where idempotency_key = ${input.idempotencyKey}
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== input.mutationHash) {
          throw new SubmissionIdempotencyConflictError();
        }
        return;
      }
      await transaction`
        insert into public.public_submissions (
          submission_id, receipt_code, phone, access_code_hash, consent_version,
          drive_folder_id, draft_json
        ) values (
          ${input.submissionId}, ${input.receiptCode}, ${input.phone}, ${input.accessCodeHash},
          ${input.consentVersion}, ${input.driveFolderId}, ${JSON.stringify(input.draft)}::jsonb
        )
      `;
      await transaction`
        insert into public.request_log (
          idempotency_key, request_id, kind, mutation_hash, response_json, expires_at
        ) values (
          ${input.idempotencyKey}, ${input.requestId}, 'PUBLIC_CREATE', ${input.mutationHash},
          ${JSON.stringify({ submissionId: input.submissionId, receiptCode: input.receiptCode })}::jsonb,
          now() + interval '24 hours'
        )
      `;
    });
  }

  async findCreationByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<StoredCreationRequest | null> {
    const database = getDatabase();
    const rows = await database<
      {
        mutation_hash: string;
        response_json: { submissionId?: unknown; receiptCode?: unknown };
      }[]
    >`
      select mutation_hash, response_json from public.request_log
      where idempotency_key = ${idempotencyKey} and kind = 'PUBLIC_CREATE'
    `;
    const row = rows[0];
    if (
      !row ||
      typeof row.response_json.submissionId !== "string" ||
      typeof row.response_json.receiptCode !== "string"
    )
      return null;
    return {
      submissionId: row.response_json.submissionId,
      receiptCode: row.response_json.receiptCode,
      mutationHash: row.mutation_hash,
    };
  }

  async findById(submissionId: string): Promise<SubmissionRecord | null> {
    const database = getDatabase();
    const rows = await database.unsafe<SubmissionRow[]>(
      `select ${SUBMISSION_SELECT} from public.public_submissions where submission_id = $1`,
      [submissionId],
    );
    return rows[0] ? mapSubmission(rows[0]) : null;
  }

  async findByLocator(submissionId: string, rowIndex: number): Promise<SubmissionRecord | null> {
    if (!Number.isInteger(rowIndex) || rowIndex < 1) return this.findById(submissionId);
    const database = getDatabase();
    const rows = await database.unsafe<SubmissionRow[]>(
      `select ${SUBMISSION_SELECT} from public.public_submissions
       where submission_id = $1 and legacy_row_index = $2`,
      [submissionId, rowIndex],
    );
    return rows[0] ? mapSubmission(rows[0]) : this.findById(submissionId);
  }

  async findByReceiptCode(receiptCode: string): Promise<SubmissionRecord | null> {
    const database = getDatabase();
    const rows = await database.unsafe<SubmissionRow[]>(
      `select ${SUBMISSION_SELECT} from public.public_submissions where receipt_code = $1 limit 1`,
      [receiptCode.trim()],
    );
    return rows[0] ? mapSubmission(rows[0]) : null;
  }

  async updateAccessState(
    record: SubmissionRecord,
    input: {
      failedAttempts?: number;
      lockedUntil?: string;
      accessCodeHash?: string;
      incrementAccessVersion?: boolean;
    },
  ): Promise<SubmissionRecord> {
    const database = getDatabase();
    const rows = await database.unsafe<SubmissionRow[]>(
      `update public.public_submissions set
         failed_attempts = coalesce($2, failed_attempts),
         locked_until = case when $6 then $3::timestamptz else locked_until end,
         access_code_hash = coalesce($4, access_code_hash),
         access_version = access_version + case when $5 then 1 else 0 end,
         updated_at = now()
       where submission_id = $1
       returning ${SUBMISSION_SELECT}`,
      [
        record.submissionId,
        input.failedAttempts ?? null,
        input.lockedUntil || null,
        input.accessCodeHash ?? null,
        input.incrementAccessVersion ?? false,
        input.lockedUntil !== undefined,
      ],
    );
    if (!rows[0]) throw new Error("Không tìm thấy bản kê khai khi cập nhật truy cập.");
    return mapSubmission(rows[0]);
  }

  async registerFailedAccessAttempt(
    submissionId: string,
    maxFailures: number,
    lockMinutes: number,
  ): Promise<{ failedAttempts: number; lockedUntil: string | null }> {
    const database = getDatabase();
    const rows = await database<{ failed_attempts: number; locked_until: string | null }[]>`
      update public.public_submissions set
        failed_attempts = case when locked_until is not null and locked_until <= now()
                               then 1 else failed_attempts + 1 end,
        locked_until = case
          when (case when locked_until is not null and locked_until <= now()
                     then 1 else failed_attempts + 1 end) >= ${maxFailures}
          then now() + (${lockMinutes} || ' minutes')::interval else null end,
        updated_at = now()
      where submission_id = ${submissionId}
      returning failed_attempts, locked_until
    `;
    if (!rows[0]) throw new Error("Không tìm thấy bản kê khai khi ghi nhận đăng nhập sai.");
    return {
      failedAttempts: rows[0].failed_attempts,
      lockedUntil: rows[0].locked_until ? new Date(rows[0].locked_until).toISOString() : null,
    };
  }

  async commitNoAction(input: {
    record: SubmissionRecord;
    expectedVersion: number;
    ownerId: string;
    existingRecordIds: string[];
    matchesCount: number;
    timelineEvent: PublicTimelineEvent;
    requestId: string;
    idempotencyKey: string;
    mutationHash: string;
  }): Promise<{ receiptCode: string; status: PublicStatus }> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string; response_json: unknown }[]>`
        select mutation_hash, response_json from public.request_log where idempotency_key = ${input.idempotencyKey}
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== input.mutationHash) {
          throw new SubmissionIdempotencyConflictError();
        }
        return cached[0].response_json as { receiptCode: string; status: PublicStatus };
      }

      const rows = await transaction.unsafe<SubmissionRow[]>(
        `update public.public_submissions set
           status = 'NO_ACTION_REQUIRED', version = version + 1, updated_at = now()
         where submission_id = $1 and version = $2
         returning ${SUBMISSION_SELECT}`,
        [input.record.submissionId, input.expectedVersion],
      );
      if (!rows[0]) throw new SubmissionVersionConflictError();
      const updated = mapSubmission(rows[0]);

      for (const recordId of input.existingRecordIds) {
        await transaction`
          insert into public.public_existing_record_links (
            submission_id, owner_id, existing_record_id, outcome
          ) values (
            ${input.record.submissionId}, ${input.ownerId}, ${recordId}, 'MATCHED_VERIFIED'
          ) on conflict do nothing
        `;
      }

      await this.insertTimeline(
        transaction,
        updated.submissionId,
        input.timelineEvent,
        "SYSTEM",
        input.requestId,
      );

      await this.insertAudit(transaction, {
        actorEmail: "PUBLIC",
        action: "PUBLIC_SUBMISSION_NO_ACTION_REQUIRED",
        entityId: updated.submissionId,
        requestId: input.requestId,
        metadata: { matchCount: input.matchesCount },
      });

      const response = { receiptCode: updated.receiptCode, status: updated.status };

      await transaction`
        insert into public.request_log (
          idempotency_key, kind, request_id, mutation_hash, response_json, expires_at
        ) values (
          ${input.idempotencyKey}, 'PUBLIC_NO_ACTION', ${input.requestId},
          ${input.mutationHash}, ${transaction.json(response)}, now() + interval '24 hours'
        )
      `;

      return response;
    });
  }

  async findExistingCertificates(citizenIdHmac: string): Promise<ExistingCertificateMatch[]> {
    const database = getDatabase();
    const rows = await database<
      {
        existing_record_id: string;
        issue_number: string;
        issue_date: string;
        registry_number: string;
      }[]
    >`
      select latest.existing_record_id, latest.issue_number, latest.issue_date, latest.registry_number
      from public.public_lookup_index lookup
      join lateral (
        select existing_record_id, issue_number, issue_date, registry_number, status
        from public.existing_certificates
        where existing_record_id = lookup.existing_record_id
        order by row_version desc limit 1
      ) latest on true
      where lookup.kind = 'EXISTING'
        and lookup.citizen_id_hmac = ${citizenIdHmac}
        and latest.status = 'VERIFIED'
      order by latest.existing_record_id
    `;
    return rows.map((row) => ({
      existingRecordId: row.existing_record_id,
      issueNumber: row.issue_number,
      issueDate: row.issue_date,
      registryNumber: row.registry_number,
    }));
  }

  async findStoredMutation(
    idempotencyKey: string,
    kind: string,
  ): Promise<StoredSubmissionMutation | null> {
    const database = getDatabase();
    const rows = await database<{ kind: string; mutation_hash: string; response_json: unknown }[]>`
      select kind, mutation_hash, response_json from public.request_log
      where idempotency_key = ${idempotencyKey} and kind = ${kind}
    `;
    return rows[0]
      ? {
          kind: rows[0].kind,
          mutationHash: rows[0].mutation_hash,
          response: safeResponse(rows[0].response_json),
        }
      : null;
  }
  async commitStaffAction(input: {
    record: SubmissionRecord;
    expectedVersion: number;
    status: PublicStatus;
    claimedBy?: string;
    claimedAt?: string;
    force?: boolean;
    supplementRequest?: SupplementRequest;
    actorEmail: string;
    auditAction: string;
    auditMetadata?: Record<string, string | number | boolean>;
    timelineEvent: PublicTimelineEvent;
    requestId: string;
    idempotencyKey: string;
    mutationHash: string;
  }): Promise<SubmissionRecord> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string }[]>`
        select mutation_hash from public.request_log where idempotency_key = ${input.idempotencyKey}
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== input.mutationHash)
          throw new SubmissionIdempotencyConflictError();
        const replayRows = await transaction.unsafe<SubmissionRow[]>(
          `select ${SUBMISSION_SELECT} from public.public_submissions where submission_id = $1`,
          [input.record.submissionId],
        );
        if (!replayRows[0]) throw new Error("Không tìm thấy bản kê khai khi phát lại thao tác.");
        return mapSubmission(replayRows[0]);
      }

      const isForce = Boolean(input.force);
      const rows = await transaction.unsafe<SubmissionRow[]>(
        `update public.public_submissions set
           status = $3, version = version + 1,
           claimed_by = coalesce($4, claimed_by),
           claimed_at = coalesce($5::timestamptz, claimed_at),
           working_payload_json = case
             when working_payload_json is null then coalesce(citizen_payload_json, draft_json)
             else working_payload_json
           end,
           working_payload_at = case
             when working_payload_json is null then now()
             else working_payload_at
           end,
           working_payload_by = case
             when working_payload_json is null then $6
             else working_payload_by
           end,
           updated_at = now()
         where submission_id = $1 and version = $2
           and ($7::boolean = true or claimed_by is null or claimed_by = '' or claimed_by = $6)
         returning ${SUBMISSION_SELECT}`,
        [
          input.record.submissionId,
          input.expectedVersion,
          input.status,
          input.claimedBy ?? null,
          input.claimedAt || null,
          input.actorEmail,
          isForce,
        ],
      );
      if (!rows[0]) {
        const current = await transaction.unsafe<SubmissionRow[]>(
          `select claimed_by from public.public_submissions where submission_id = $1`,
          [input.record.submissionId],
        );
        if (
          current[0] &&
          current[0].claimed_by &&
          current[0].claimed_by !== input.actorEmail &&
          !isForce
        ) {
          throw new SubmissionAlreadyClaimedError();
        }
        throw new SubmissionVersionConflictError();
      }
      const next = mapSubmission(rows[0]);

      if (!input.record.workingPayload && next.workingPayload) {
        await transaction`
          insert into public.public_submission_payload_history
            (submission_id, layer, payload_version, payload_json, actor_email)
          values (
            ${input.record.submissionId}, 'WORKING', 1, ${JSON.stringify(next.workingPayload)}::jsonb, ${input.actorEmail}
          )
          on conflict (submission_id, layer, payload_version) do nothing
        `;
      }

      if (input.supplementRequest) {
        await this.insertSupplementRequest(
          transaction,
          input.record.submissionId,
          input.supplementRequest,
          input.actorEmail,
        );
      }
      await this.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: input.auditAction,
        entityId: input.record.submissionId,
        requestId: input.requestId,
        metadata: input.auditMetadata,
      });
      await this.insertTimeline(
        transaction,
        input.record.submissionId,
        input.timelineEvent,
        input.actorEmail,
        input.requestId,
      );
      await transaction`
        insert into public.request_log
          (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
        values (
          ${input.idempotencyKey}, ${input.requestId}, 'STAFF_ACTION', ${input.mutationHash},
          ${JSON.stringify({ status: next.status, version: next.version, claimedBy: next.claimedBy || null })}::jsonb,
          now() + interval '24 hours'
        )
      `;
      return next;
    });
  }

  /**
   * Cán bộ sửa trực tiếp một số trường trong `draft_json` (lỗi gõ nhỏ của người dân) mà không
   * đổi trạng thái hồ sơ. Trường định danh đã `QR_CONFIRMED` bị khóa ở tầng route trước khi gọi
   * hàm này — repository chỉ ghi draft đã được validate.
   */
  async commitStaffDraftEdit(input: {
    record: SubmissionRecord;
    expectedVersion: number;
    draft: IntakeDraft;
    actorEmail: string;
    auditMetadata: Record<string, string | number | boolean>;
    timelineEvent: PublicTimelineEvent;
    requestId: string;
    idempotencyKey: string;
    mutationHash: string;
  }): Promise<SubmissionRecord> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string }[]>`
        select mutation_hash from public.request_log where idempotency_key = ${input.idempotencyKey}
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== input.mutationHash)
          throw new SubmissionIdempotencyConflictError();
        const replayRows = await transaction.unsafe<SubmissionRow[]>(
          `select ${SUBMISSION_SELECT} from public.public_submissions where submission_id = $1`,
          [input.record.submissionId],
        );
        if (!replayRows[0]) throw new Error("Không tìm thấy bản kê khai khi phát lại thao tác.");
        return mapSubmission(replayRows[0]);
      }

      const rows = await transaction.unsafe<SubmissionRow[]>(
        `update public.public_submissions set
           draft_json = $3::jsonb, version = version + 1, updated_at = now()
         where submission_id = $1 and version = $2
         returning ${SUBMISSION_SELECT}`,
        [input.record.submissionId, input.expectedVersion, JSON.stringify(input.draft)],
      );
      if (!rows[0]) throw new SubmissionVersionConflictError();
      const next = mapSubmission(rows[0]);

      if (input.record.status !== "DRAFT") {
        await this.refreshCanonicalProjection(transaction, input.record.submissionId, input.draft);
      }

      await this.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: "SUBMISSION_STAFF_EDITED",
        entityId: input.record.submissionId,
        requestId: input.requestId,
        metadata: input.auditMetadata,
      });
      await this.insertTimeline(
        transaction,
        input.record.submissionId,
        input.timelineEvent,
        input.actorEmail,
        input.requestId,
      );
      await transaction`
        insert into public.request_log
          (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
        values (
          ${input.idempotencyKey}, ${input.requestId}, 'STAFF_DRAFT_EDIT', ${input.mutationHash},
          ${JSON.stringify({ version: next.version })}::jsonb,
          now() + interval '24 hours'
        )
      `;
      return next;
    });
  }

  async commitWorkingPayload(input: {
    record: SubmissionRecord;
    expectedVersion: number;
    draft: IntakeDraft;
    actorEmail: string;
    changeNote?: string;
    requestId: string;
    idempotencyKey: string;
    mutationHash: string;
    aiApplication?: {
      resultId: string;
      jobId: string;
      appliedFieldPaths: readonly string[];
    };
  }): Promise<SubmissionRecord> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string }[]>`
        select mutation_hash from public.request_log where idempotency_key = ${input.idempotencyKey}
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== input.mutationHash)
          throw new SubmissionIdempotencyConflictError();
        const replayRows = await transaction.unsafe<SubmissionRow[]>(
          `select ${SUBMISSION_SELECT} from public.public_submissions where submission_id = $1`,
          [input.record.submissionId],
        );
        if (!replayRows[0]) throw new Error("Không tìm thấy bản kê khai khi phát lại thao tác.");
        return mapSubmission(replayRows[0]);
      }

      const rows = await transaction.unsafe<SubmissionRow[]>(
        `update public.public_submissions set
           working_payload_json = $3::jsonb,
           working_payload_at = now(),
           working_payload_by = $4,
           draft_json = $3::jsonb,
           version = version + 1,
           updated_at = now()
         where submission_id = $1 and version = $2
         returning ${SUBMISSION_SELECT}`,
        [
          input.record.submissionId,
          input.expectedVersion,
          JSON.stringify(input.draft),
          input.actorEmail,
        ],
      );
      if (!rows[0]) throw new SubmissionVersionConflictError();
      const next = mapSubmission(rows[0]);

      await transaction`
        insert into public.public_submission_payload_history
          (submission_id, layer, payload_version, payload_json, actor_email)
        values (
          ${input.record.submissionId}, 'WORKING', ${next.version}, ${JSON.stringify(input.draft)}::jsonb, ${input.actorEmail}
        )
        on conflict (submission_id, layer, payload_version) do nothing
      `;

      if (input.record.status !== "DRAFT") {
        await this.refreshCanonicalProjection(transaction, input.record.submissionId, input.draft);
      }

      await this.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: input.aiApplication ? "AI_DRAFT_APPLIED" : "SUBMISSION_WORKING_PAYLOAD_EDITED",
        entityId: input.record.submissionId,
        requestId: input.requestId,
        metadata: input.aiApplication
          ? {
              aiResultId: input.aiApplication.resultId,
              aiJobId: input.aiApplication.jobId,
              appliedFieldPaths: input.aiApplication.appliedFieldPaths.join(","),
              changeNote: input.changeNote || "",
            }
          : { changeNote: input.changeNote || "" },
      });

      if (input.aiApplication && input.aiApplication.appliedFieldPaths.length > 0) {
        await transaction`
          update public.ai_field_comparisons
          set decision = 'APPLIED', decided_by = ${input.actorEmail}, decided_at = now()
          where result_id = ${input.aiApplication.resultId}
            and job_id = ${input.aiApplication.jobId}
            and field_path = any(${input.aiApplication.appliedFieldPaths})
            and decision = 'PENDING'
        `;
      }

      await transaction`
        insert into public.request_log
          (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
        values (
          ${input.idempotencyKey}, ${input.requestId}, 'WORKING_PAYLOAD_EDIT', ${input.mutationHash},
          ${JSON.stringify({
            version: next.version,
            updatedAt: next.updatedAt,
            aiResultId: input.aiApplication?.resultId ?? null,
            expectedVersion: input.expectedVersion,
            appliedFieldPaths: input.aiApplication?.appliedFieldPaths ?? [],
            requestId: input.requestId,
          })}::jsonb,
          now() + interval '24 hours'
        )
      `;
      return next;
    });
  }

  /**
   * Điều chỉnh hồ sơ ĐÃ tiếp nhận chính thức.
   *
   * Khác `commitStaffDraftEdit` ở đúng một việc, nhưng là việc quyết định: ngoài `draft_json` và
   * hình chiếu chuẩn hóa phía bản kê khai, hàm này còn **ghi lại dữ liệu chính thức**
   * (`certificates`/`owners`/`parcels`/`assets` theo `case_id`) trong CÙNG transaction.
   *
   * Vì sao phải cùng transaction: nếu `draft_json` ghi xong mà đồng bộ chính thức lỗi, hồ sơ sẽ
   * mang hai phiên bản dữ liệu khác nhau vĩnh viễn, không cách nào biết bên nào đúng. Cùng
   * transaction thì hoặc cả hai đổi, hoặc không gì đổi.
   *
   * Không đụng tới file trên Drive và không đụng `cases.case_id` — điều chỉnh là sửa nội dung,
   * không phải tiếp nhận lại. Mã hồ sơ chính thức giữ nguyên.
   */
  async commitOfficialAmendment(input: {
    record: SubmissionRecord;
    expectedVersion: number;
    draft: IntakeDraft;
    actorEmail: string;
    amendmentReason: string;
    auditMetadata: Record<string, string | number | boolean>;
    timelineEvent: PublicTimelineEvent;
    requestId: string;
    idempotencyKey: string;
    mutationHash: string;
  }): Promise<SubmissionRecord> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string }[]>`
        select mutation_hash from public.request_log where idempotency_key = ${input.idempotencyKey}
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== input.mutationHash)
          throw new SubmissionIdempotencyConflictError();
        const replayRows = await transaction.unsafe<SubmissionRow[]>(
          `select ${SUBMISSION_SELECT} from public.public_submissions where submission_id = $1`,
          [input.record.submissionId],
        );
        if (!replayRows[0]) throw new Error("Không tìm thấy bản kê khai khi phát lại thao tác.");
        return mapSubmission(replayRows[0]);
      }

      // Điều kiện `status = 'ACCEPTED'` nằm trong chính câu UPDATE, không chỉ kiểm ở route: hồ sơ
      // có thể đổi trạng thái giữa lúc route đọc và lúc ghi.
      const rows = await transaction.unsafe<SubmissionRow[]>(
        `update public.public_submissions set
           draft_json = $3::jsonb,
           official_payload_json = $3::jsonb,
           official_payload_at = now(),
           official_payload_by = $4,
           version = version + 1, updated_at = now()
         where submission_id = $1 and version = $2 and status = 'ACCEPTED'
           and coalesce(official_case_id, '') <> ''
         returning ${SUBMISSION_SELECT}`,
        [
          input.record.submissionId,
          input.expectedVersion,
          JSON.stringify(input.draft),
          input.actorEmail,
        ],
      );
      if (!rows[0]) throw new SubmissionVersionConflictError();
      const next = mapSubmission(rows[0]);

      await this.refreshCanonicalProjection(transaction, input.record.submissionId, input.draft);

      const counts = await syncOfficialRecord(transaction, {
        caseId: next.officialCaseId,
        submissionId: input.record.submissionId,
        draft: input.draft,
      });

      await this.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: "OFFICIAL_RECORD_AMENDED",
        entityId: input.record.submissionId,
        requestId: input.requestId,
        metadata: {
          ...input.auditMetadata,
          officialCaseId: next.officialCaseId,
          amendmentReason: input.amendmentReason,
          ownerCount: counts.ownerCount,
          parcelCount: counts.parcelCount,
          assetCount: counts.assetCount,
        },
      });
      await this.insertTimeline(
        transaction,
        input.record.submissionId,
        input.timelineEvent,
        input.actorEmail,
        input.requestId,
      );
      await transaction`
        insert into public.request_log
          (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
        values (
          ${input.idempotencyKey}, ${input.requestId}, 'OFFICIAL_AMENDMENT', ${input.mutationHash},
          ${JSON.stringify({ version: next.version, officialCaseId: next.officialCaseId })}::jsonb,
          now() + interval '24 hours'
        )
      `;
      return next;
    });
  }

  async commitAccessSecretReset(input: {
    record: SubmissionRecord;
    accessCodeHash: string;
    actorEmail: string;
    requestId: string;
    idempotencyKey: string;
    mutationHash: string;
  }): Promise<SubmissionRecord> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string }[]>`
        select mutation_hash from public.request_log where idempotency_key = ${input.idempotencyKey}
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== input.mutationHash)
          throw new SubmissionIdempotencyConflictError();
        const replayRows = await transaction.unsafe<SubmissionRow[]>(
          `select ${SUBMISSION_SELECT} from public.public_submissions where submission_id = $1`,
          [input.record.submissionId],
        );
        if (!replayRows[0]) throw new Error("Không tìm thấy bản kê khai khi phát lại thao tác.");
        return mapSubmission(replayRows[0]);
      }
      const rows = await transaction.unsafe<SubmissionRow[]>(
        `update public.public_submissions set
           access_code_hash = $2, failed_attempts = 0, locked_until = null,
           access_version = access_version + 1, updated_at = now()
         where submission_id = $1 returning ${SUBMISSION_SELECT}`,
        [input.record.submissionId, input.accessCodeHash],
      );
      if (!rows[0]) throw new Error("Không tìm thấy bản kê khai khi đặt lại mã bí mật.");
      const next = mapSubmission(rows[0]);
      await this.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: "PUBLIC_ACCESS_SECRET_RESET",
        entityId: input.record.submissionId,
        requestId: input.requestId,
        metadata: { accessVersion: next.accessVersion, identityVerified: true },
      });
      await transaction`
        insert into public.request_log
          (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
        values (
          ${input.idempotencyKey}, ${input.requestId}, 'ACCESS_SECRET_RESET', ${input.mutationHash},
          ${JSON.stringify({ accessVersion: next.accessVersion })}::jsonb,
          now() + interval '24 hours'
        )
      `;
      return next;
    });
  }

  async appendPendingIdentityIndex(input: {
    record: SubmissionRecord;
    citizenIdHmac: string;
  }): Promise<void> {
    const database = getDatabase();
    await database`
      insert into public.public_lookup_index (kind, citizen_id_hmac, submission_id)
      values ('PENDING', ${input.citizenIdHmac}, ${input.record.submissionId})
      on conflict do nothing
    `;
  }

  async hasPendingIdentityMatch(
    citizenIdHmac: string,
    excludeSubmissionId: string,
  ): Promise<boolean> {
    const database = getDatabase();
    const rows = await database<{ found: boolean }[]>`
      select exists (
        select 1 from public.public_lookup_index lookup
        join public.public_submissions submission on submission.submission_id = lookup.submission_id
        where lookup.kind = 'PENDING' and lookup.citizen_id_hmac = ${citizenIdHmac}
          and lookup.submission_id <> ${excludeSubmissionId}
          and submission.status in ('SUBMITTED','UNDER_REVIEW','NEEDS_SUPPLEMENT','RESUBMITTED','ACCEPTING')
      ) as found
    `;
    return rows[0]?.found ?? false;
  }

  async linkExistingCertificates(input: {
    submissionId: string;
    ownerId: string;
    existingRecordIds: readonly string[];
    outcome: "MATCHED_VERIFIED" | "WARN_PENDING";
  }): Promise<void> {
    if (!input.existingRecordIds.length) return;
    const database = getDatabase();
    await database.begin(async (transaction) => {
      for (const existingRecordId of new Set(input.existingRecordIds)) {
        await transaction`
          insert into public.public_existing_record_links
            (submission_id, owner_id, existing_record_id, outcome)
          values (${input.submissionId}, ${input.ownerId}, ${existingRecordId}, ${input.outcome})
          on conflict (submission_id, owner_id, existing_record_id, status) do nothing
        `;
      }
    });
  }

  async list(): Promise<SubmissionRecord[]> {
    const database = getDatabase();
    const rows = await database.unsafe<SubmissionRow[]>(
      `select ${SUBMISSION_SELECT} from public.public_submissions order by legacy_row_index`,
    );
    return rows.map(mapSubmission);
  }

  /**
   * Đọc phân lô (keyset pagination) theo `legacy_row_index` phục vụ xuất báo cáo PL3,
   * tránh tải toàn bộ dữ liệu vào bộ nhớ cùng lúc. Trả về AsyncGenerator theo từng lô.
   */
  async *listForExport(input: {
    statuses: readonly PublicStatus[];
    fromDate?: string;
    toDate?: string;
    batchSize?: number;
  }): AsyncGenerator<SubmissionRecord[]> {
    const database = getDatabase();
    const batchSize = input.batchSize ?? 500;
    let lastRowIndex = 0;

    while (true) {
      const rows = await database.unsafe<SubmissionRow[]>(
        `select ${SUBMISSION_SELECT}
         from public.public_submissions
         where status = any($1)
           and ($2::timestamptz is null or updated_at >= $2::timestamptz)
           and ($3::timestamptz is null or updated_at < $3::timestamptz)
           and legacy_row_index > $4
         order by legacy_row_index
         limit $5`,
        [input.statuses, input.fromDate || null, input.toDate || null, lastRowIndex, batchSize],
      );

      if (rows.length === 0) {
        break;
      }

      const records = rows.map(mapSubmission);
      yield records;

      lastRowIndex = Number(rows[rows.length - 1].legacy_row_index);
      if (rows.length < batchSize) {
        break;
      }
    }
  }

  async listSummaries(): Promise<SubmissionSummary[]> {
    const database = getDatabase();
    const rows = await database<
      {
        submission_id: string;
        receipt_code: string;
        status: PublicStatus;
        phone: string;
        version: number;
        claimed_by: string | null;
        updated_at: Date;
        legacy_row_index: string | number;
      }[]
    >`
      select submission_id, receipt_code::text, status, phone, version, claimed_by,
        updated_at, legacy_row_index
      from public.public_submissions order by legacy_row_index
    `;
    return rows.map((row) => ({
      submissionId: row.submission_id,
      receiptCode: row.receipt_code,
      status: row.status,
      phone: row.phone,
      version: row.version,
      claimedBy: row.claimed_by ?? "",
      updatedAt: row.updated_at.toISOString(),
      rowIndex: Number(row.legacy_row_index),
    }));
  }

  async getDraftDisplayFields(rowIndexes: readonly number[]): Promise<
    Map<
      number,
      {
        issueNumber: string;
        ownerName: string;
      }
    >
  > {
    const result = new Map<number, { issueNumber: string; ownerName: string }>();
    if (!rowIndexes.length) return result;
    const database = getDatabase();
    const rows = await database<
      {
        legacy_row_index: string | number;
        issue_number: string;
        owner_name: string;
      }[]
    >`
      select legacy_row_index,
        coalesce(draft_json #>> '{certificate,issueNumber}', '') as issue_number,
        coalesce(draft_json #>> '{owners,0,fullName}', '') as owner_name
      from public.public_submissions
      where legacy_row_index = any(${database.array([...rowIndexes], 20)})
    `;
    for (const row of rows) {
      result.set(Number(row.legacy_row_index), {
        issueNumber: row.issue_number,
        ownerName: row.owner_name,
      });
    }
    return result;
  }

  async transition(input: {
    record: SubmissionRecord;
    expectedVersion: number;
    status: PublicStatus;
    claimedBy?: string;
    claimedAt?: string;
    officialCaseId?: string;
    acceptStep?: string;
  }): Promise<SubmissionRecord> {
    const database = getDatabase();
    const rows = await database.unsafe<SubmissionRow[]>(
      `update public.public_submissions set
         status = $3, version = version + 1,
         claimed_by = coalesce($4, claimed_by), claimed_at = coalesce($5::timestamptz, claimed_at),
         official_case_id = coalesce($6, official_case_id), accept_step = coalesce($7, accept_step),
         updated_at = now()
       where submission_id = $1 and version = $2 returning ${SUBMISSION_SELECT}`,
      [
        input.record.submissionId,
        input.expectedVersion,
        input.status,
        input.claimedBy ?? null,
        input.claimedAt || null,
        input.officialCaseId ?? null,
        input.acceptStep ?? null,
      ],
    );
    if (!rows[0]) throw new SubmissionVersionConflictError();
    return mapSubmission(rows[0]);
  }
  async appendTimelineEvent(
    submissionId: string,
    event: PublicTimelineEvent,
    actorEmail: string,
    requestId: string,
  ): Promise<void> {
    await this.insertTimeline(getDatabase(), submissionId, event, actorEmail, requestId);
  }

  async listTimeline(submissionId: string): Promise<PublicTimelineEvent[]> {
    const database = getDatabase();
    const rows = await database<
      {
        event_id: string;
        event_type: string;
        label: string;
        actor_display_name: string;
        message: string;
        occurred_at: Date;
      }[]
    >`
      select event_id, event_type, label, actor_display_name, message, occurred_at
      from public.public_status_events where submission_id = ${submissionId}
      order by occurred_at
    `;
    return rows.map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type,
      label: row.label,
      actorDisplayName: row.actor_display_name || "Cán bộ phường",
      message: row.message,
      occurredAt: row.occurred_at.toISOString(),
    }));
  }

  async createSupplementRequest(input: {
    submissionId: string;
    request: SupplementRequest;
    actorEmail: string;
  }): Promise<void> {
    const database = getDatabase();
    await database.begin((transaction) =>
      this.insertSupplementRequest(
        transaction,
        input.submissionId,
        input.request,
        input.actorEmail,
      ),
    );
  }

  async getOpenSupplementRequest(submissionId: string): Promise<SupplementRequest | null> {
    const database = getDatabase();
    const requests = await database<
      {
        supplement_request_id: string;
        reason_code: SupplementRequest["reasonCode"];
        message: string;
        requested_by_display_name: string;
        created_at: Date;
        resolved_at: Date | null;
      }[]
    >`
      select supplement_request_id, reason_code, message, requested_by_display_name,
        created_at, resolved_at
      from public.public_supplement_requests
      where submission_id = ${submissionId} and status = 'OPEN'
      order by created_at desc limit 1
    `;
    const request = requests[0];
    if (!request) return null;
    const items = await database<
      {
        item_id: string;
        item_type: SupplementItem["itemType"];
        target_entity_type: SupplementItem["targetEntityType"];
        target_entity_id: string;
        field_path: string;
        document_type: SupplementItem["documentType"];
        reason_code: SupplementItem["reasonCode"];
        instruction: string;
      }[]
    >`
      select item_id, item_type, target_entity_type, target_entity_id, field_path,
        document_type, reason_code, instruction
      from public.public_supplement_items
      where supplement_request_id = ${request.supplement_request_id} and status = 'OPEN'
      order by created_at, item_id
    `;
    return {
      requestId: request.supplement_request_id,
      status: "OPEN",
      reasonCode: request.reason_code,
      message: request.message,
      requestedByDisplayName: request.requested_by_display_name || "Cán bộ phường",
      createdAt: request.created_at.toISOString(),
      resolvedAt: asIso(request.resolved_at),
      items: items.map((item) => ({
        itemId: item.item_id,
        requestId: request.supplement_request_id,
        itemType: item.item_type,
        targetEntityType: item.target_entity_type,
        targetEntityId: item.target_entity_id,
        fieldPath: item.field_path,
        documentType: item.document_type,
        reasonCode: item.reason_code,
        instruction: item.instruction,
        status: "OPEN",
      })),
    };
  }

  async resolveOpenSupplementRequest(submissionId: string): Promise<void> {
    const database = getDatabase();
    await database.begin(async (transaction) => {
      const requests = await transaction<{ supplement_request_id: string }[]>`
        update public.public_supplement_requests set status = 'RESOLVED', resolved_at = now()
        where supplement_request_id = (
          select supplement_request_id from public.public_supplement_requests
          where submission_id = ${submissionId} and status = 'OPEN'
          order by created_at desc limit 1 for update
        ) returning supplement_request_id
      `;
      if (requests[0]) {
        await transaction`
          update public.public_supplement_items set status = 'RESOLVED', resolved_at = now()
          where supplement_request_id = ${requests[0].supplement_request_id} and status = 'OPEN'
        `;
      }
    });
  }

  async appendAudit(input: {
    actorEmail: string;
    action: string;
    entityId: string;
    requestId: string;
    metadata?: Record<string, string | number | boolean>;
  }): Promise<void> {
    await this.insertAudit(getDatabase(), input);
  }

  async appendExportJob(job: ExportJobRecord): Promise<void> {
    const database = getDatabase();
    await database`
      insert into public.export_jobs (
        export_job_id, export_type, status, drive_file_id, file_name, row_count,
        submission_count, warning_count, checksum_sha256, actor_email, scope_json,
        created_at, completed_at
      ) values (
        ${job.exportJobId}, ${job.exportType}, ${job.status}, ${job.driveFileId}, ${job.fileName},
        ${job.rowCount}, ${job.submissionCount}, ${job.warningCount}, ${job.checksumSha256},
        ${job.actorEmail}, ${job.scopeJson}::jsonb, ${job.createdAt}, ${job.completedAt}
      )
    `;
  }

  async saveDraft(
    record: SubmissionRecord,
    draft: IntakeDraft,
    status: PublicStatus,
  ): Promise<number> {
    const database = getDatabase();
    const rows = await database<{ version: number }[]>`
      update public.public_submissions set
        draft_json = ${JSON.stringify(draft)}::jsonb,
        phone = ${draft.phone || record.phone}, status = ${status}, version = version + 1,
        updated_at = now()
      where submission_id = ${record.submissionId} and version = ${record.version}
      returning version
    `;
    if (!rows[0]) throw new SubmissionVersionConflictError();
    return rows[0].version;
  }

  async appendFile(
    file: Omit<StoredFile, "status">,
    record?: SubmissionRecord,
    idempotencyOptions?: {
      idempotencyKey: string;
      mutationHash: string;
      requestId: string;
      replaceFileId?: string;
    },
  ): Promise<PublicFileSummary> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      if (idempotencyOptions) {
        await transaction`select pg_advisory_xact_lock(hashtextextended(${idempotencyOptions.idempotencyKey}, 0))`;
        const cached = await transaction<{ mutation_hash: string; response_json: unknown }[]>`
          select mutation_hash, response_json from public.request_log where idempotency_key = ${idempotencyOptions.idempotencyKey}
        `;
        if (cached[0]) {
          if (cached[0].mutation_hash !== idempotencyOptions.mutationHash) {
            throw new SubmissionIdempotencyConflictError();
          }
          return cached[0].response_json as PublicFileSummary;
        }
      }

      if (idempotencyOptions?.replaceFileId) {
        await transaction`
          update public.public_files set status = 'REPLACED', updated_at = now()
          where submission_id = ${file.submissionId} and file_id = ${idempotencyOptions.replaceFileId}
            and status = 'UPLOADED'
        `;
      }

      if (file.documentType !== "CERTIFICATE") {
        await transaction`
          update public.public_files set status = 'REPLACED', updated_at = now()
          where submission_id = ${file.submissionId} and owner_id = ${file.ownerId}
            and document_type = ${file.documentType} and status = 'UPLOADED'
        `;
      }
      const rows = await transaction<FileRow[]>`
        insert into public.public_files (
          file_id, submission_id, owner_id, document_type, drive_file_id, mime_type,
          size_bytes, checksum_sha256, file_name
        ) values (
          ${file.fileId}, ${file.submissionId}, ${file.ownerId}, ${file.documentType},
          ${file.driveFileId}, ${file.mimeType}, ${file.sizeBytes}, ${file.checksum}, ${file.fileName}
        ) returning file_id, submission_id, owner_id, document_type, drive_file_id, mime_type,
          size_bytes, checksum_sha256, file_name, status, created_at, updated_at
      `;
      if (record) await this.refreshFileSummaries(transaction, file.submissionId);
      const summary = this.fileSummary(mapFile(rows[0]));

      if (idempotencyOptions) {
        await transaction`
          insert into public.request_log (
            idempotency_key, kind, request_id, mutation_hash, response_json, expires_at
          ) values (
            ${idempotencyOptions.idempotencyKey}, 'PUBLIC_UPLOAD_COMPLETE',
            ${idempotencyOptions.requestId}, ${idempotencyOptions.mutationHash},
            ${JSON.stringify(summary)}::jsonb, now() + interval '24 hours'
          )
        `;
      }

      return summary;
    });
  }

  async listFiles(submissionId: string, includeInactive = false): Promise<StoredFile[]> {
    const database = getDatabase();
    const rows = await database<FileRow[]>`
      select file_id, submission_id, owner_id, document_type, drive_file_id, mime_type,
        size_bytes, checksum_sha256, file_name, status, created_at, updated_at
      from public.public_files
      where submission_id = ${submissionId}
        and (${includeInactive} or status = 'UPLOADED')
      order by created_at, file_id
    `;
    return rows.map(mapFile);
  }

  async markFileReplaced(submissionId: string, fileId: string): Promise<void> {
    await this.markFileStatus(submissionId, fileId, "REPLACED");
  }

  async markFileDeleted(submissionId: string, fileId: string): Promise<void> {
    await this.markFileStatus(submissionId, fileId, "DELETED");
  }
  async submit(input: {
    record: SubmissionRecord;
    draft: IntakeDraft;
    status: "SUBMITTED" | "RESUBMITTED";
    timelineEvent: PublicTimelineEvent;
    actorEmail: string;
    requestId: string;
    idempotencyKey: string;
    mutationHash: string;
    pendingIdentityHmacs?: string[];
  }): Promise<void> {
    const database = getDatabase();
    await database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string }[]>`
        select mutation_hash from public.request_log where idempotency_key = ${input.idempotencyKey}
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== input.mutationHash)
          throw new SubmissionIdempotencyConflictError();
        return;
      }

      const updated = await transaction<{ version: number; citizen_payload_version: number }[]>`
        update public.public_submissions set
          status = ${input.status}, phone = ${input.draft.phone || input.record.phone},
          version = version + 1, draft_json = ${JSON.stringify(input.draft)}::jsonb,
          citizen_payload_json = ${JSON.stringify(input.draft)}::jsonb,
          citizen_payload_version = citizen_payload_version + 1,
          citizen_payload_at = now(),
          accept_step = null, claimed_by = null, claimed_at = null, updated_at = now()
        where submission_id = ${input.record.submissionId} and version = ${input.record.version}
        returning version, citizen_payload_version
      `;
      if (!updated[0]) throw new SubmissionVersionConflictError();

      await transaction`
        insert into public.public_submission_payload_history
          (submission_id, layer, payload_version, payload_json, actor_email)
        values (
          ${input.record.submissionId}, 'CITIZEN', ${updated[0].citizen_payload_version}, ${JSON.stringify(input.draft)}::jsonb, ${input.actorEmail}
        )
        on conflict (submission_id, layer, payload_version) do nothing
      `;

      await this.refreshCanonicalProjection(
        transaction,
        input.record.submissionId,
        input.draft,
        input.pendingIdentityHmacs,
      );

      // AI chỉ nhận đúng các file CERTIFICATE đã xác minh. Job được tạo trong cùng transaction
      // với lần gửi hồ sơ để retry submit không sinh job trùng hay đọc bộ ảnh nửa chừng.
      await enqueueAiDraftForSubmission(transaction, {
        submissionId: input.record.submissionId,
        citizenPayloadVersion: updated[0].citizen_payload_version,
      });

      if (input.status === "RESUBMITTED") {
        await this.resolveOpenSupplementRequestWithSql(transaction, input.record.submissionId);
      }

      await this.insertTimeline(
        transaction,
        input.record.submissionId,
        input.timelineEvent,
        input.actorEmail,
        input.requestId,
      );
      await this.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action:
          input.status === "RESUBMITTED"
            ? "PUBLIC_SUBMISSION_RESUBMITTED"
            : "PUBLIC_SUBMISSION_SUBMITTED",
        entityId: input.record.submissionId,
        requestId: input.requestId,
      });
      await transaction`
        insert into public.request_log
          (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
        values (
          ${input.idempotencyKey}, ${input.requestId}, 'PUBLIC_SUBMIT', ${input.mutationHash},
          ${JSON.stringify({ status: input.status, version: updated[0].version })}::jsonb,
          now() + interval '24 hours'
        )
      `;
    });
  }

  async insertAudit(
    sql: Sql,
    input: {
      actorEmail: string;
      action: string;
      entityId: string;
      requestId: string;
      metadata?: Record<string, string | number | boolean>;
    },
  ): Promise<void> {
    await sql`
      insert into public.audit_logs
        (audit_id, actor_email, action, entity_type, entity_id, request_id, metadata)
      values (
        ${randomUUID()}, ${input.actorEmail}, ${input.action}, 'PUBLIC_SUBMISSION',
        ${input.entityId}, ${input.requestId}, ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
    `;
  }

  async insertTimeline(
    sql: Sql,
    submissionId: string,
    event: PublicTimelineEvent,
    actorEmail: string,
    requestId: string,
  ): Promise<void> {
    await sql`
      insert into public.public_status_events (
        event_id, submission_id, event_type, label, actor_email, actor_display_name,
        message, occurred_at, request_id
      ) values (
        ${event.eventId}, ${submissionId}, ${event.eventType}, ${event.label}, ${actorEmail},
        ${event.actorDisplayName}, ${event.message}, ${event.occurredAt}, ${requestId}
      ) on conflict (event_id) do nothing
    `;
  }

  private async insertSupplementRequest(
    sql: Sql,
    submissionId: string,
    request: SupplementRequest,
    actorEmail: string,
  ): Promise<void> {
    await sql`
      insert into public.public_supplement_requests (
        supplement_request_id, submission_id, status, reason_code, message,
        requested_by_email, requested_by_display_name, created_at, resolved_at
      ) values (
        ${request.requestId}, ${submissionId}, ${request.status}, ${request.reasonCode},
        ${request.message}, ${actorEmail}, ${request.requestedByDisplayName},
        ${request.createdAt}, ${request.resolvedAt || null}
      )
    `;
    for (const item of request.items) {
      await sql`
        insert into public.public_supplement_items (
          item_id, supplement_request_id, submission_id, item_type, target_entity_type,
          target_entity_id, field_path, document_type, reason_code, instruction, status, created_at
        ) values (
          ${item.itemId}, ${item.requestId}, ${submissionId}, ${item.itemType},
          ${item.targetEntityType}, ${item.targetEntityId}, ${item.fieldPath},
          ${item.documentType}, ${item.reasonCode}, ${item.instruction}, ${item.status},
          ${request.createdAt}
        )
      `;
    }
  }

  private async resolveOpenSupplementRequestWithSql(sql: Sql, submissionId: string): Promise<void> {
    const requests = await sql<{ supplement_request_id: string }[]>`
      update public.public_supplement_requests set status = 'RESOLVED', resolved_at = now()
      where supplement_request_id = (
        select supplement_request_id from public.public_supplement_requests
        where submission_id = ${submissionId} and status = 'OPEN'
        order by created_at desc limit 1 for update
      ) returning supplement_request_id
    `;
    if (requests[0]) {
      await sql`
        update public.public_supplement_items set status = 'RESOLVED', resolved_at = now()
        where supplement_request_id = ${requests[0].supplement_request_id} and status = 'OPEN'
      `;
    }
  }

  private async markFileStatus(
    submissionId: string,
    fileId: string,
    status: "REPLACED" | "DELETED",
  ): Promise<void> {
    const database = getDatabase();
    await database.begin(async (transaction) => {
      const current = await transaction<{ status: StoredFile["status"] }[]>`
        select status from public.public_files
        where submission_id = ${submissionId} and file_id = ${fileId} for update
      `;
      if (!current[0]) throw new Error("Không tìm thấy ảnh cần cập nhật.");
      if (current[0].status !== status) {
        if (current[0].status !== "UPLOADED") throw new Error("Ảnh không còn hiệu lực.");
        await transaction`
          update public.public_files set status = ${status}, updated_at = now()
          where submission_id = ${submissionId} and file_id = ${fileId}
        `;
      }
      await this.refreshFileSummaries(transaction, submissionId);
    });
  }

  private async refreshFileSummaries(sql: Sql, submissionId: string): Promise<void> {
    const rows = await sql<FileRow[]>`
      select file_id, submission_id, owner_id, document_type, drive_file_id, mime_type,
        size_bytes, checksum_sha256, file_name, status, created_at, updated_at
      from public.public_files where submission_id = ${submissionId}
      order by created_at, file_id
    `;
    const summaries = rows.map((row) => this.fileSummary(mapFile(row)));
    await sql`
      update public.public_submissions
      set file_summary_json = ${JSON.stringify(summaries)}::jsonb, updated_at = now()
      where submission_id = ${submissionId}
    `;
  }

  private fileSummary(file: StoredFile): PublicFileSummary {
    return {
      fileId: file.fileId,
      ownerId: file.ownerId,
      documentType: file.documentType,
      status: file.status,
      sizeBytes: file.sizeBytes,
      checksum: file.checksum,
      createdAt: file.createdAt ?? "",
      updatedAt: file.updatedAt ?? "",
      driveFileId: file.driveFileId,
      mimeType: file.mimeType,
    };
  }

  private async refreshCanonicalProjection(
    transaction: Sql,
    submissionId: string,
    draft: IntakeDraft,
    pendingIdentityHmacs?: string[],
  ): Promise<void> {
    // THỨ TỰ XÓA LÀ BẮT BUỘC: con trước cha. `public_land_uses.parcel_id` tham chiếu
    // `public_parcels(parcel_id)` (schema 202607230001) và ràng buộc đó KHÔNG cascade, KHÔNG
    // deferrable — xóa cha trước sẽ ném `foreign_key_violation` và rollback cả transaction.
    // Lần gửi đầu không lộ lỗi vì bảng còn rỗng nên delete là no-op; lỗi chỉ nổ từ lần làm mới
    // thứ hai trở đi (cán bộ sửa hồ sơ đã gửi, hoặc người dân gửi bổ sung).
    await transaction`delete from public.public_land_uses where submission_id = ${submissionId}`;
    await transaction`delete from public.public_parcels where submission_id = ${submissionId}`;
    await transaction`delete from public.public_owners where submission_id = ${submissionId}`;
    await transaction`delete from public.public_certificates where submission_id = ${submissionId}`;
    await transaction`delete from public.public_assets where submission_id = ${submissionId}`;

    if (draft.certificate) {
      await transaction`
        insert into public.public_certificates
          (certificate_id, submission_id, issue_number, issue_date, registry_number)
        values (${`CERT:${submissionId}`}, ${submissionId}, ${draft.certificate.issueNumber},
          ${draft.certificate.issueDate}, ${draft.certificate.registryNumber})
      `;
    }
    for (const owner of draft.owners || []) {
      await transaction`
        insert into public.public_owners (
          owner_id, submission_id, owner_type, full_name, identity_number, role_on_certificate,
          date_of_birth, gender, residence_address, identity_source, qr_payload_hash,
          qr_decoder_version, qr_parser_version, identity_status, identity_confirmed_at,
          identity_override_reason,
          has_distinct_current_user, current_user_name, current_user_citizen_id,
          current_user_address, change_reason
        ) values (
          ${owner.id}, ${submissionId}, ${owner.ownerType}, ${owner.fullName},
          ${owner.identityNumber}, ${owner.roleOnCertificate}, ${owner.dateOfBirth},
          ${owner.gender}, ${owner.residenceAddress}, ${owner.identitySource},
          ${owner.qrPayloadHash}, ${owner.qrDecoderVersion}, ${owner.qrParserVersion},
          ${owner.identityStatus}, ${owner.identityConfirmedAt}, ${owner.identityOverrideReason ?? ""},
          ${owner.hasDistinctCurrentUser},
          ${owner.currentUserName}, ${owner.currentUserCitizenId}, ${owner.currentUserAddress},
          ${owner.changeReason}
        )
      `;
    }
    for (const parcel of draft.parcels || []) {
      await transaction`
        insert into public.public_parcels (
          parcel_id, submission_id, parcel_id_code, map_sheet_number, parcel_number,
          address_on_certificate, address_two_level, area, old_ward
        ) values (
          ${parcel.id}, ${submissionId}, ${parcel.parcelIdCode},
          ${parcel.mapSheetNumber}, ${parcel.parcelNumber}, ${parcel.addressOnCertificate},
          ${parcel.addressTwoLevel}, ${parcel.area}, ${parcel.oldWard}
        )
      `;
      for (const landUse of parcel.landUses || []) {
        await transaction`
          insert into public.public_land_uses (
            land_use_id, submission_id, parcel_id, purpose_code, purpose_free_text,
            origin_code, form_code, term_code, area
          ) values (
            ${landUse.id}, ${submissionId}, ${parcel.id}, ${landUse.purposeCode},
            ${landUse.purposeFreeText ?? ""}, ${landUse.originCode}, ${landUse.formCode},
            ${landUse.termCode}, ${landUse.area}
          )
        `;
      }
    }
    for (const asset of draft.assets || []) {
      await transaction`
        insert into public.public_assets (asset_id, submission_id, asset_type, description)
        values (${asset.id}, ${submissionId}, ${asset.assetType}, ${asset.description})
      `;
    }
    for (const hmac of pendingIdentityHmacs ?? []) {
      await transaction`
        insert into public.public_lookup_index (kind, citizen_id_hmac, submission_id)
        values ('PENDING', ${hmac}, ${submissionId}) on conflict do nothing
      `;
    }
  }
}

export function getPublicIntakeRepository(): PublicIntakeRepository {
  return new PublicIntakeRepository();
}

export class SubmissionVersionConflictError extends Error {
  constructor() {
    super("Bản kê khai đã được thay đổi bởi cán bộ khác.");
    this.name = "SubmissionVersionConflictError";
  }
}

export class SubmissionIdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key đã được dùng cho một thao tác khác.");
    this.name = "SubmissionIdempotencyConflictError";
  }
}

export class SubmissionAlreadyClaimedError extends Error {
  constructor() {
    super("Hồ sơ đang do cán bộ khác nhận xử lý.");
    this.name = "SubmissionAlreadyClaimedError";
  }
}
