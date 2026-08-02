import { randomUUID } from "node:crypto";


import type { Sql } from "postgres";

// `official-record.ts` chỉ phụ thuộc `./types`, không phụ thuộc repository — không tạo vòng import.
import { syncOfficialRecord } from "@/modules/submissions/official-record";
import { enqueueAiDraftForSubmission } from "@/modules/ai-extraction/repository";
import { UserRole } from "@/modules/common/domain";
import { getDatabase } from "@/modules/supabase/database";
import {
  decodeQueueCursor,
  encodeQueueCursor,
  type QueueCursor,
} from "@/modules/submissions/queue-pagination";

import { mayStaffEditState } from "@/modules/submissions/review";

import { effectivePayload } from "./payload-layers";
import { requiresCitizenId, type IntakeDraft } from "./types";
import { MAX_CERTIFICATE_PHOTOS, SUBMISSION_BYTE_BUDGET } from "./upload-commit";
import {
  certificateLookupAuditMetadata,
  certificateLookupResult,
  isCertificateLookupRateLimited,
  type CertificateLookupResult,
  type CertificateLookupStatus,
  CERTIFICATE_LOOKUP_RATE_WINDOW_SECONDS,
} from "./certificate-lookup";
import type { FileNormalizationMetadata, UploadAttemptMetric } from "./upload-metrics";
import { summarizeWorkingPayloadChanges } from "./working-payload-audit";
import {
  type PublicFileSummary,
  type PublicStatus,
  type PublicBucket,
  type PublicTimelineEvent,
  serializePublicTimelineEvent,
  type SupplementItem,
  type SupplementRequest,
  PUBLIC_STATUSES,
  getSubmissionBucket,
  QUEUE_BUCKET_SQL_CONDITION,
} from "./workflow";

export { PUBLIC_STATUSES, PUBLIC_BUCKETS } from "./workflow";
export type { PublicStatus, PublicBucket } from "./workflow";

/**
 * Nguồn của hồ sơ.
 *
 * `OFFICER_ASSISTED` do **máy chủ** gán từ phiên đăng nhập của cán bộ. Client không bao giờ được
 * gửi giá trị này lên: nhận từ client là để bất kỳ ai cũng gắn nhãn "cán bộ đã nhập hộ" cho hồ sơ
 * của mình, làm mất luôn ý nghĩa của việc phân biệt nguồn.
 */
export const INTAKE_CHANNELS = ["SELF_SERVICE", "OFFICER_ASSISTED"] as const;
export const COMPLETED_FILE_UPLOAD_REPLAY_KINDS = [
  "PUBLIC_UPLOAD_COMPLETE",
  "OFFICER_UPLOAD_COMPLETE",
] as const;
export type CompletedFileUploadReplayKind = (typeof COMPLETED_FILE_UPLOAD_REPLAY_KINDS)[number];

/**
 * Trần số bản ghi số đo tải ảnh cho MỘT hồ sơ.
 *
 * Đặt rất cao so với thực tế (một hộ tối đa 2 ảnh CCCD mỗi chủ sử dụng + 10 ảnh GCN, kể cả mạng
 * rất tệ cũng chỉ vài chục lượt kể cả thử lại). Trần này không nhằm giới hạn người dân mà nhằm
 * chặn một phiên hợp lệ bơm vô hạn dòng vào bảng qua `/uploads/metrics`.
 */
export const MAX_UPLOAD_ATTEMPTS_PER_SUBMISSION = 200;
export type IntakeChannel = (typeof INTAKE_CHANNELS)[number];

/** Cán bộ ngồi nhập hộ. Mọi trường do máy chủ điền từ phiên đăng nhập. */
export interface AssistingOfficer {
  readonly email: string;
  readonly displayName: string;
}

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
  readonly driveFolderId: string | null;
  readonly officialCaseId: string;
  readonly acceptStep: string;
  readonly claimedBy: string;
  /**
   * Tên cán bộ tại thời điểm nhận xử lý. Rỗng với hồ sơ nhận trước 2026-07-28.
   *
   * Lưu tại chỗ thay vì join sang `public.users` mỗi lần đọc: tên hiển thị đổi được, và cán bộ
   * nghỉ việc thì bản ghi `users` có thể bị vô hiệu hóa — join sẽ làm lịch sử hồ sơ mất dấu
   * người từng xử lý.
   */
  readonly claimedByDisplayName: string;
  readonly claimedAt: string;
  readonly intakeChannel: IntakeChannel;
  readonly assistedByEmail: string;
  readonly assistedByDisplayName: string;
  readonly assistedAt: string;
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
  /** Ghi chú nội bộ của cán bộ. Chỉ hiển thị trong màn duyệt hồ sơ, không lộ ra cổng công khai. */
  readonly internalNotes: string;
}

export interface SubmissionSummary {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly status: PublicStatus;
  readonly phone: string;
  readonly version: number;
  readonly claimedBy: string;
  readonly claimedByDisplayName: string;
  readonly updatedAt: string;
  readonly rowIndex: number;
}

export type SubmissionFolderState = "PENDING" | "CREATING" | "READY" | "FAILED";

/**
 * Số lần thử tạo thư mục Drive tối đa cho một hồ sơ. Vượt trần thì ngừng gọi Google thay vì
 * retry vô hạn khi Drive lỗi kéo dài; cần can thiệp thủ công để đặt lại `drive_folder_attempts`.
 */
export const MAX_SUBMISSION_FOLDER_ATTEMPTS = 10;

export interface SubmissionFolderSnapshot {
  readonly driveFolderId: string | null;
  readonly state: SubmissionFolderState;
  /**
   * Token sở hữu lease — chuỗi PostgreSQL trả về nguyên văn, KHÔNG phải mốc thời gian để hiển
   * thị hay tính toán. Không bao giờ đưa qua `Date`: xem chú thích ở `SubmissionFolderRow`.
   */
  readonly leaseToken: string;
  readonly attempts: number;
}

export interface QueueSubmissionSummary {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly status: PublicStatus;
  readonly phone: string;
  readonly version: number;
  readonly claimedBy: string;
  readonly claimedByDisplayName: string;
  readonly updatedAt: string;
  readonly issueNumber: string;
  readonly ownerName: string;
}

export interface DashboardSummaryOfficerMetrics {
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly UserRole[];
  readonly active: boolean;
  readonly claimedCount: number;
  readonly inProgressCount: number;
  readonly completedCount: number;
  readonly completionRate: string;
  readonly lastActivity: string | null;
  readonly total: number;
  readonly inProgress: number;
  readonly accepted: number;
}

export interface DashboardSummary {
  readonly totals: {
    readonly total: number;
    readonly pending: number;
    readonly inProgress: number;
    readonly accepted: number;
    readonly unassigned: number;
  };
  readonly officers: readonly DashboardSummaryOfficerMetrics[];
  readonly statusBreakdown: Readonly<Record<PublicStatus, number>>;
}

export interface QueueSubmissionPage {
  readonly items: readonly QueueSubmissionSummary[];
  readonly nextCursor: string | null;
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

export class CertificateLookupRateLimitError extends Error {
  constructor() {
    super("Đã đạt giới hạn tra cứu. Vui lòng thử lại sau ít phút.");
    this.name = "CertificateLookupRateLimitError";
  }
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
  readonly drive_folder_id: string | null;
  readonly accept_step: string | null;
  readonly claimed_by: string | null;
  readonly claimed_by_display_name: string | null;
  readonly intake_channel: string | null;
  readonly assisted_by_email: string | null;
  readonly assisted_by_display_name: string | null;
  readonly assisted_at: Date | null;
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
  readonly internal_notes: string | null;
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

interface SubmissionFolderRow {
  readonly drive_folder_id: string | null;
  readonly drive_folder_state: SubmissionFolderState;
  /**
   * Luôn đọc bằng `::text`, KHÔNG để driver ép sang `Date`: `timestamptz` chính xác tới
   * micro-giây còn `Date` của JS chỉ tới mili-giây. Ép sang `Date` rồi so
   * `= ${token}::timestamptz` sẽ lệch ở phần micro-giây và checkpoint READY không bao giờ khớp.
   */
  readonly drive_folder_lease_until: string | null;
  readonly drive_folder_attempts: number;
}

const SUBMISSION_SELECT = `
  submission_id, receipt_code::text, status, phone, version, access_code_hash,
  failed_attempts, locked_until, consent_version, consented_at, retention_until,
  official_case_id, drive_folder_id, accept_step, claimed_by, claimed_by_display_name, claimed_at,
  intake_channel, assisted_by_email, assisted_by_display_name, assisted_at,
  created_at, updated_at, draft_json, access_version, file_summary_json, legacy_row_index,
  citizen_payload_json, citizen_payload_version, citizen_payload_at,
  working_payload_json, working_payload_at, working_payload_by,
  official_payload_json, official_payload_at, official_payload_by,
  internal_notes
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
    claimedByDisplayName: row.claimed_by_display_name ?? "",
    intakeChannel: row.intake_channel === "OFFICER_ASSISTED" ? "OFFICER_ASSISTED" : "SELF_SERVICE",
    assistedByEmail: row.assisted_by_email ?? "",
    assistedByDisplayName: row.assisted_by_display_name ?? "",
    assistedAt: asIso(row.assisted_at),
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
    internalNotes: row.internal_notes ?? "",
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

function mapSubmissionFolder(row: SubmissionFolderRow): SubmissionFolderSnapshot {
  return {
    driveFolderId: row.drive_folder_id,
    state: row.drive_folder_state,
    leaseToken: row.drive_folder_lease_until ?? "",
    attempts: row.drive_folder_attempts,
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
    driveFolderId: string | null;
    draft: IntakeDraft;
    consentVersion: string;
    /** Mặc định `SELF_SERVICE`; chỉ route nhân viên đã xác thực mới truyền giá trị khác. */
    intakeChannel?: IntakeChannel;
    assistedBy?: AssistingOfficer;
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
      const channel: IntakeChannel = input.intakeChannel ?? "SELF_SERVICE";
      const assisted = channel === "OFFICER_ASSISTED" ? (input.assistedBy ?? null) : null;
      await transaction`
        insert into public.public_submissions (
          submission_id, receipt_code, phone, access_code_hash, consent_version,
          drive_folder_id, drive_folder_state, draft_json,
          intake_channel, assisted_by_email, assisted_by_display_name, assisted_at
        ) values (
          ${input.submissionId}, ${input.receiptCode}, ${input.phone}, ${input.accessCodeHash},
          ${input.consentVersion}, ${input.driveFolderId},
          ${input.driveFolderId ? "READY" : "PENDING"}, ${JSON.stringify(input.draft)}::jsonb,
          ${channel}, ${assisted?.email ?? null}, ${assisted?.displayName ?? null},
          ${assisted ? new Date().toISOString() : null}
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
      await this.insertAudit(transaction, {
        actorEmail: assisted?.email ?? "PUBLIC",
        action: assisted ? "ASSISTED_SUBMISSION_CREATED" : "PUBLIC_SUBMISSION_CREATED",
        entityId: input.submissionId,
        requestId: input.requestId,
        metadata: {
          consentAccepted: true,
          consentVersion: input.consentVersion,
          intakeChannel: channel,
        },
      });
    });
  }

  /**
   * Atomically claims the short-lived right to create one submission's Drive folder.
   *
   * The transaction ends before any Google request starts. A crashed worker therefore cannot
   * retain a database connection; the next request can take over after the lease expires.
   */
  async tryAcquireSubmissionFolderLease(
    submissionId: string,
    leaseSeconds: number,
  ): Promise<SubmissionFolderSnapshot | null> {
    const database = getDatabase();
    const rows = await database<SubmissionFolderRow[]>`
      update public.public_submissions
      set drive_folder_state = 'CREATING',
          drive_folder_lease_until = now() + (${leaseSeconds} * interval '1 second'),
          drive_folder_attempts = drive_folder_attempts + 1
      where submission_id = ${submissionId}
        and drive_folder_id is null
        and drive_folder_attempts < ${MAX_SUBMISSION_FOLDER_ATTEMPTS}
        and (
          drive_folder_state in ('PENDING', 'FAILED')
          or (
            drive_folder_state = 'CREATING'
            and (
              drive_folder_lease_until is null
              or drive_folder_lease_until <= now()
            )
          )
        )
      returning drive_folder_id, drive_folder_state,
        drive_folder_lease_until::text as drive_folder_lease_until,
        drive_folder_attempts
    `;
    return rows[0] ? mapSubmissionFolder(rows[0]) : null;
  }

  async getSubmissionFolderSnapshot(
    submissionId: string,
  ): Promise<SubmissionFolderSnapshot | null> {
    const database = getDatabase();
    const rows = await database<SubmissionFolderRow[]>`
      select drive_folder_id, drive_folder_state,
        drive_folder_lease_until::text as drive_folder_lease_until,
        drive_folder_attempts
      from public.public_submissions
      where submission_id = ${submissionId}
      limit 1
    `;
    return rows[0] ? mapSubmissionFolder(rows[0]) : null;
  }

  async markSubmissionFolderReady(
    submissionId: string,
    driveFolderId: string,
    leaseToken: string,
  ): Promise<SubmissionFolderSnapshot | null> {
    const database = getDatabase();
    const rows = await database<SubmissionFolderRow[]>`
      update public.public_submissions
      set drive_folder_id = ${driveFolderId},
          drive_folder_state = 'READY',
          drive_folder_lease_until = null
      where submission_id = ${submissionId}
        and drive_folder_id is null
        and drive_folder_state = 'CREATING'
        and drive_folder_lease_until = (${leaseToken}::text)::timestamptz
      returning drive_folder_id, drive_folder_state,
        drive_folder_lease_until::text as drive_folder_lease_until,
        drive_folder_attempts
    `;
    return rows[0] ? mapSubmissionFolder(rows[0]) : null;
  }

  /** Store only a state transition; Drive errors can contain internal IDs and must not persist. */
  async markSubmissionFolderFailed(submissionId: string, leaseToken: string): Promise<void> {
    const database = getDatabase();
    await database`
      update public.public_submissions
      set drive_folder_state = 'FAILED',
          drive_folder_lease_until = null
      where submission_id = ${submissionId}
        and drive_folder_id is null
        and drive_folder_state = 'CREATING'
        and drive_folder_lease_until = (${leaseToken}::text)::timestamptz
    `;
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

  /**
   * Tìm kết quả replay đã hoàn tất trong `request_log` **NGOÀI** transaction.
   *
   * Route upload-complete gọi phương thức này TRƯỚC khi xác minh Drive: nếu server đã commit
   * nhưng response mất, retry phải trả kết quả cũ mà không đụng Drive. Advisory lock bên trong
   * `commitPublicFileUpload`/`commitOfficerFileUpload` vẫn giữ replay trong transaction để xử lý
   * hai request đồng thời. `kind` là danh mục đóng và luôn nằm trong điều kiện SQL để hai đường
   * public/officer không đọc kết quả của nhau.
   */
  async findCompletedFileUploadReplay(input: {
    readonly idempotencyKey: string;
    readonly mutationHash: string;
    readonly kind: CompletedFileUploadReplayKind;
  }): Promise<{ readonly summary: PublicFileSummary; readonly replayed: true } | null> {
    const database = getDatabase();
    const rows = await database<{ mutation_hash: string; response_json: unknown }[]>`
      select mutation_hash, response_json from public.request_log
      where idempotency_key = ${input.idempotencyKey} and kind = ${input.kind}
    `;
    if (!rows[0]) return null;
    if (rows[0].mutation_hash !== input.mutationHash) {
      throw new SubmissionIdempotencyConflictError();
    }
    return { summary: parseStoredUploadReplaySummary(rows[0].response_json), replayed: true };
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

  /**
   * Đối chiếu số GCN trong cùng transaction với audit/rate limit. Chỉ trả status allowlist; không
   * đưa identifier của certificate, submission, case hay bất kỳ PII nào ra khỏi repository.
   */
  async lookupCertificateByIssue(input: {
    normalizedIssueNumber: string;
    issueDate: string;
    excludeSubmissionId?: string;
    rateLimitKey: string;
    lookupFingerprint: string;
    source: "PUBLIC" | "SUBMISSION";
    requestId: string;
  }): Promise<CertificateLookupResult> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      // Cùng một nguồn phải nối đuôi trong transaction: SELECT-then-INSERT không khóa sẽ để nhiều
      // request song song cùng vượt qua ngưỡng trước khi audit được ghi.
      await transaction`select pg_advisory_xact_lock(hashtextextended(${`CERTIFICATE_LOOKUP:${input.rateLimitKey}`}, 0))`;
      const attempts = await transaction<{ attempt_count: string | number }[]>`
        select count(*) as attempt_count
        from public.audit_logs
        where action = 'PUBLIC_CERTIFICATE_LOOKUP'
          and metadata ->> 'rateLimitKey' = ${input.rateLimitKey}
          and occurred_at >= now() - (${CERTIFICATE_LOOKUP_RATE_WINDOW_SECONDS} * interval '1 second')
      `;
      if (isCertificateLookupRateLimited(Number(attempts[0]?.attempt_count ?? 0))) {
        throw new CertificateLookupRateLimitError();
      }

      const processing = await transaction<{ found: boolean }[]>`
        select exists (
          select 1
          from public.public_certificates certificate
          join public.public_submissions submission
            on submission.submission_id = certificate.submission_id
          where upper(regexp_replace(certificate.issue_number, '[[:space:]-]+', '', 'g')) = ${input.normalizedIssueNumber}
            and certificate.issue_date = ${input.issueDate}
            and submission.submission_id <> ${input.excludeSubmissionId ?? ""}
            and submission.status in ('DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_SUPPLEMENT','RESUBMITTED','ACCEPTING')
        ) as found
      `;
      const officiallyReceived = await transaction<{ found: boolean }[]>`
        select exists (
          select 1
          from public.certificates certificate
          where upper(regexp_replace(certificate.issue_number, '[[:space:]-]+', '', 'g')) = ${input.normalizedIssueNumber}
            and certificate.issue_date = ${input.issueDate}
          union all
          select 1
          from (
            select distinct on (existing_record_id)
              existing_record_id, issue_number, issue_date, status
            from public.existing_certificates
            order by existing_record_id, row_version desc
          ) existing_certificate
          where existing_certificate.status = 'VERIFIED'
            and upper(regexp_replace(existing_certificate.issue_number, '[[:space:]-]+', '', 'g')) = ${input.normalizedIssueNumber}
            and existing_certificate.issue_date = ${input.issueDate}
        ) as found
      `;
      const status: CertificateLookupStatus | null = officiallyReceived[0]?.found
        ? "OFFICIALLY_RECEIVED"
        : processing[0]?.found
          ? "IN_PROCESSING"
          : null;
      const result = certificateLookupResult(status);

      await this.insertAudit(transaction, {
        actorEmail: "PUBLIC",
        action: "PUBLIC_CERTIFICATE_LOOKUP",
        entityId: "CERTIFICATE_LOOKUP",
        requestId: input.requestId,
        metadata: certificateLookupAuditMetadata({
          source: input.source,
          rateLimitKey: input.rateLimitKey,
          lookupFingerprint: input.lookupFingerprint,
          result,
        }),
      });
      return result;
    });
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
    /** Truyền cùng `claimedBy`. Chuỗi rỗng nghĩa là xóa (RELEASE), `undefined` là giữ nguyên. */
    claimedByDisplayName?: string;
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
           claimed_by_display_name = coalesce($8, claimed_by_display_name),
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
          input.claimedByDisplayName ?? null,
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
          ${JSON.stringify({
            status: next.status,
            version: next.version,
            claimedBy: next.claimedBy || null,
            claimedByDisplayName: next.claimedByDisplayName || null,
          })}::jsonb,
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
    /**
     * HMAC tra cứu của các CCCD hợp lệ trong `draft`, do route tính (repository không chạm env).
     *
     * Cán bộ nhập hộ hoặc sửa giúp CCCD mà người dân để trống ở MỨC A. Không ghi ở đây thì hồ sơ
     * đó vĩnh viễn nằm ngoài chỉ mục tra cứu và không bao giờ bị phát hiện trùng. Insert dùng
     * `on conflict do nothing` nên ghi lại nhiều lần là vô hại.
     */
    pendingIdentityHmacs?: string[];
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
        await this.refreshCanonicalProjection(
          transaction,
          input.record.submissionId,
          input.draft,
          input.pendingIdentityHmacs,
        );
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

  /**
   * Ghi chú nội bộ của cán bộ — một ô tự do, không thuộc `draft_json`/PL3, không sinh timeline
   * (người dân không bao giờ thấy). Tách khỏi `commitStaffDraftEdit`/`commitOfficialAmendment` vì
   * không gắn với trạng thái hồ sơ hay quyền "đang nhận xử lý": bất kỳ cán bộ nào có quyền quyết
   * định hồ sơ cũng ghi được, ở bất kỳ trạng thái nào (kể cả đã `ACCEPTED`/`REJECTED`).
   */
  async commitInternalNotes(input: {
    record: SubmissionRecord;
    expectedVersion: number;
    internalNotes: string;
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
           internal_notes = $3, version = version + 1, updated_at = now()
         where submission_id = $1 and version = $2
         returning ${SUBMISSION_SELECT}`,
        [input.record.submissionId, input.expectedVersion, input.internalNotes],
      );
      if (!rows[0]) throw new SubmissionVersionConflictError();
      const next = mapSubmission(rows[0]);

      // Không lưu nội dung ghi chú vào audit — đây là chỗ cán bộ có thể gõ số điện thoại, tên
      // người dân khi diễn giải; audit chỉ cần biết AI đã sửa và độ dài, không cần bản sao PII.
      await this.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: "SUBMISSION_INTERNAL_NOTE_UPDATED",
        entityId: input.record.submissionId,
        requestId: input.requestId,
        metadata: { noteLength: input.internalNotes.length },
      });
      await transaction`
        insert into public.request_log
          (idempotency_key, request_id, kind, mutation_hash, response_json, expires_at)
        values (
          ${input.idempotencyKey}, ${input.requestId}, 'INTERNAL_NOTES_EDIT', ${input.mutationHash},
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
    /**
     * Cán bộ đã đối chiếu CCCD và xác nhận thủ công một hay nhiều chủ sử dụng. Chỉ lưu số lượng
     * để audit không chứa mã định danh hoặc dữ liệu người dân.
     */
    manualIdentityConfirmationOwnerCount?: number;
    /** Loại request log riêng để phát lại thao tác xác nhận không lẫn với lần lưu bàn làm việc. */
    requestLogKind?: "WORKING_PAYLOAD_EDIT" | "MANUAL_IDENTITY_CONFIRMATION";
    /**
     * HMAC tra cứu của các CCCD hợp lệ trong `draft`, do route tính (repository không chạm env).
     *
     * Cán bộ nhập hộ hoặc sửa giúp CCCD mà người dân để trống ở MỨC A. Không ghi ở đây thì hồ sơ
     * đó vĩnh viễn nằm ngoài chỉ mục tra cứu và không bao giờ bị phát hiện trùng. Insert dùng
     * `on conflict do nothing` nên ghi lại nhiều lần là vô hại.
     */
    pendingIdentityHmacs?: string[];
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
        await this.refreshCanonicalProjection(
          transaction,
          input.record.submissionId,
          input.draft,
          input.pendingIdentityHmacs,
        );
      }

      const auditSummary = summarizeWorkingPayloadChanges(
        input.record.workingPayload ?? input.record.citizenPayload ?? input.record.draft,
        input.draft,
      );
      await this.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: input.aiApplication
          ? "AI_DRAFT_APPLIED"
          : input.manualIdentityConfirmationOwnerCount
            ? "SUBMISSION_IDENTITY_MANUALLY_CONFIRMED"
            : "SUBMISSION_WORKING_PAYLOAD_EDITED",
        entityId: input.record.submissionId,
        requestId: input.requestId,
        metadata: input.aiApplication
          ? {
              aiResultId: input.aiApplication.resultId,
              aiJobId: input.aiApplication.jobId,
              appliedFieldPaths: input.aiApplication.appliedFieldPaths.join(","),
              changeNote: input.changeNote || "",
              changedFieldPaths: auditSummary.changedFieldPaths.join(","),
              changedFieldCount: auditSummary.changedFieldCount,
              changedFieldPathsTruncated: auditSummary.changedFieldPathsTruncated,
              automaticOverrideReasons: JSON.stringify(auditSummary.automaticOverrideReasons),
            }
          : {
              changeNote: input.changeNote || "",
              changedFieldPaths: auditSummary.changedFieldPaths.join(","),
              changedFieldCount: auditSummary.changedFieldCount,
              changedFieldPathsTruncated: auditSummary.changedFieldPathsTruncated,
              automaticOverrideReasons: JSON.stringify(auditSummary.automaticOverrideReasons),
              ...(input.manualIdentityConfirmationOwnerCount
                ? {
                    manualIdentityConfirmation: true,
                    manualIdentityConfirmationOwnerCount:
                      input.manualIdentityConfirmationOwnerCount,
                  }
                : {}),
            },
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
          ${input.idempotencyKey}, ${input.requestId}, ${input.requestLogKind ?? "WORKING_PAYLOAD_EDIT"}, ${input.mutationHash},
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
   * Khác `commitStaffDraftEdit` ở đúng một việc, nhưng là việc quyết định: ngoài `draft_json` v�
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
    /**
     * HMAC tra cứu của các CCCD hợp lệ trong `draft`, do route tính (repository không chạm env).
     *
     * Cán bộ nhập hộ hoặc sửa giúp CCCD mà người dân để trống ở MỨC A. Không ghi ở đây thì hồ sơ
     * đó vĩnh viễn nằm ngoài chỉ mục tra cứu và không bao giờ bị phát hiện trùng. Insert dùng
     * `on conflict do nothing` nên ghi lại nhiều lần là vô hại.
     */
    pendingIdentityHmacs?: string[];
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

      await this.refreshCanonicalProjection(
        transaction,
        input.record.submissionId,
        input.draft,
        input.pendingIdentityHmacs,
      );

      const counts = await syncOfficialRecord(transaction, {
        caseId: next.officialCaseId,
        submissionId: input.record.submissionId,
        draft: input.draft,
      });
      const auditSummary = summarizeWorkingPayloadChanges(
        input.record.officialPayload ?? input.record.workingPayload ?? input.record.draft,
        input.draft,
      );

      await this.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: "OFFICIAL_RECORD_AMENDED",
        entityId: input.record.submissionId,
        requestId: input.requestId,
        metadata: {
          ...input.auditMetadata,
          officialCaseId: next.officialCaseId,
          amendmentReason: input.amendmentReason,
          changedFieldPaths: auditSummary.changedFieldPaths.join(","),
          changedFieldCount: auditSummary.changedFieldCount,
          changedFieldPathsTruncated: auditSummary.changedFieldPathsTruncated,
          automaticOverrideReasons: JSON.stringify(auditSummary.automaticOverrideReasons),
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
    officer?: string;
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
           and ($4::text is null or claimed_by = $4)
           and legacy_row_index > $5
         order by legacy_row_index
         limit $6`,
        [
          input.statuses,
          input.fromDate || null,
          input.toDate || null,
          input.officer || null,
          lastRowIndex,
          batchSize,
        ],
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

  /**
   * Hàng chờ cán bộ được lọc, tìm và phân trang hoàn toàn trong PostgreSQL.
   *
   * `limit + 1` chỉ dùng để phát hiện trang kế; route không còn tải toàn bảng hoặc `draft_json`.
   */
  async listQueuePage(input: {
    status?: PublicStatus;
    bucket?: PublicBucket;
    actionType?: "claimed" | "completed";
    fromDate?: string;
    toDate?: string;
    query?: string;
    cursor?: string | null;
    limit?: number;
    officer?: string;
    unassigned?: boolean;
  }): Promise<QueueSubmissionPage> {
    const database = getDatabase();
    const pageLimit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 100);
    const cursor: QueueCursor | null = decodeQueueCursor(input.cursor);
    const normalizedQuery = input.query?.trim() ?? "";
    const searchPattern = normalizedQuery
      ? `%${normalizedQuery.replace(/[!%_]/g, (character) => `!${character}`)}%`
      : null;

    const rows = await database.unsafe<
      {
        submission_id: string;
        receipt_code: string;
        status: PublicStatus;
        phone: string;
        version: number;
        claimed_by: string | null;
        claimed_by_display_name: string | null;
        updated_at: Date;
        queue_issue_number: string;
        queue_owner_name: string;
      }[]
    >(
      `select submission_id, receipt_code::text, status, phone, version, claimed_by,
         claimed_by_display_name, updated_at, queue_issue_number, queue_owner_name
       from public.public_submissions
       where ($1::text is null or status = $1)
         and (
           $2::text is null
           or receipt_code::text ilike $2 escape '!'
           or queue_issue_number ilike $2 escape '!'
           or queue_owner_name ilike $2 escape '!'
         )
         and (
           $3::timestamptz is null
           or updated_at < $3::timestamptz
           or (updated_at = $3::timestamptz and submission_id < $4)
         )
         and ($6::text is null or $11::text is not null or claimed_by = $6)
         and (
           $7::boolean is not true
           or (claimed_by is null and status in ('SUBMITTED', 'RESUBMITTED', 'NEEDS_SUPPLEMENT'))
         )
         and (
           ${QUEUE_BUCKET_SQL_CONDITION}
         )
         and ($11::text is not null or $9::timestamptz is null or updated_at >= $9::timestamptz)
         and ($11::text is not null or $10::timestamptz is null or updated_at < $10::timestamptz)
         and (
           $11::text is null
           or ($11 = 'claimed' and submission_id in (
             select entity_id from public.audit_logs
             where entity_type = 'PUBLIC_SUBMISSION'
               and ($6::text is null or actor_email = $6)
               and action in ('SUBMISSION_CLAIMED', 'SUBMISSION_FORCE_CLAIMED')
               and ($9::timestamptz is null or created_at >= $9::timestamptz)
               and ($10::timestamptz is null or created_at < $10::timestamptz)
           ))
           or ($11 = 'completed' and submission_id in (
             select entity_id from public.audit_logs
             where entity_type = 'PUBLIC_SUBMISSION'
               and ($6::text is null or actor_email = $6)
               and action = 'OFFICIAL_ACCEPTANCE_COMPLETED'
               and ($9::timestamptz is null or created_at >= $9::timestamptz)
               and ($10::timestamptz is null or created_at < $10::timestamptz)
           ))
         )
       order by updated_at desc, submission_id desc
       limit $5`,
      [
        input.status ?? null,
        searchPattern,
        cursor?.updatedAt ?? null,
        cursor?.submissionId ?? null,
        pageLimit + 1,
        input.officer ?? null,
        input.unassigned ?? false,
        input.bucket ?? null,
        input.fromDate ?? null,
        input.toDate ?? null,
        input.actionType ?? null,
      ],
    );

    const pageRows = rows.slice(0, pageLimit);
    const items = pageRows.map((row) => ({
      submissionId: row.submission_id,
      receiptCode: row.receipt_code,
      status: row.status,
      phone: row.phone,
      version: row.version,
      claimedBy: row.claimed_by ?? "",
      claimedByDisplayName: row.claimed_by_display_name ?? "",
      updatedAt: row.updated_at.toISOString(),
      issueNumber: row.queue_issue_number,
      ownerName: row.queue_owner_name,
    }));
    const lastItem = items[items.length - 1];

    return {
      items,
      nextCursor:
        rows.length > pageLimit && lastItem
          ? encodeQueueCursor({
              updatedAt: lastItem.updatedAt,
              submissionId: lastItem.submissionId,
            })
          : null,
    };
  }

  async getDashboardSummary(input: {
    fromDate?: string;
    toDate?: string;
    officer?: string;
    status?: PublicStatus;
  }): Promise<DashboardSummary> {
    const database = getDatabase();
    const fromDate: Date | null = input.fromDate ? new Date(input.fromDate) : null;
    const toDate: Date | null = input.toDate ? new Date(input.toDate) : null;

    // 1. Compute overall totals & status breakdown from public_submissions
    const submissionRows = await database.unsafe<
      {
        claimed_by: string | null;
        status: PublicStatus;
        count: number;
      }[]
    >(
      `select claimed_by, status, count(*)::int as count
       from public.public_submissions
       where ($1::timestamptz is null or updated_at >= $1::timestamptz)
         and ($2::timestamptz is null or updated_at < $2::timestamptz)
         and ($3::text is null or claimed_by = $3)
         and ($4::text is null or status = $4)
       group by claimed_by, status`,
      [
        fromDate?.toISOString() || null,
        toDate?.toISOString() || null,
        input.officer || null,
        input.status || null,
      ],
    );

    let total = 0;
    let pending = 0;
    let inProgress = 0;
    let accepted = 0;
    let unassigned = 0;

    const statusBreakdown = Object.fromEntries(
      PUBLIC_STATUSES.map((s: PublicStatus) => [s, 0]),
    ) as Record<PublicStatus, number>;

    for (const row of submissionRows) {
      const rowObj = row as { claimed_by?: string | null; officer_email?: string | null; status: PublicStatus; count: number };
      const claimed_by = rowObj.claimed_by || rowObj.officer_email || null;
      const { status, count } = rowObj;
      total += count;
      statusBreakdown[status] += count;

      const bucket = getSubmissionBucket(status, !!claimed_by);
      if (bucket === "pending") pending += count;
      else if (bucket === "in-progress") inProgress += count;
      else if (bucket === "accepted") accepted += count;

      if (!claimed_by && bucket === "pending") {
        unassigned += count;
      }
    }

    // 2. Query ALL users from public.users with LEFT JOINs for event-based stats
    const accountRows = await database.unsafe<
      {
        email: string;
        display_name: string;
        roles: UserRole[];
        active: boolean;
        claimed_count: number;
        in_progress_count: number;
        completed_count: number;
        last_claim_at: Date | null;
        last_completion_at: Date | null;
        last_sub_updated_at: Date | null;
        last_audit_at: Date | null;
      }[]
    >(
      `with all_users as (
         select email::text, display_name::text, roles, active
         from public.users
       ),
       claims as (
         select
           actor_email::text as email,
           count(distinct entity_id)::int as claimed_count,
           max(created_at) as last_claim_at
         from public.audit_logs
         where action in ('SUBMISSION_CLAIMED', 'SUBMISSION_FORCE_CLAIMED')
           and entity_type = 'PUBLIC_SUBMISSION'
           and ($1::timestamptz is null or created_at >= $1::timestamptz)
           and ($2::timestamptz is null or created_at < $2::timestamptz)
         group by actor_email
       ),
       completions as (
         select
           actor_email::text as email,
           count(distinct entity_id)::int as completed_count,
           max(created_at) as last_completion_at
         from public.audit_logs
         where action = 'OFFICIAL_ACCEPTANCE_COMPLETED'
           and entity_type = 'PUBLIC_SUBMISSION'
           and ($1::timestamptz is null or created_at >= $1::timestamptz)
           and ($2::timestamptz is null or created_at < $2::timestamptz)
         group by actor_email
       ),
       current_in_progress as (
         select
           claimed_by::text as email,
           count(*)::int as in_progress_count,
           max(updated_at) as last_sub_updated_at
         from public.public_submissions
         where claimed_by is not null and claimed_by != ''
           and (
             status in ('UNDER_REVIEW', 'ACCEPTING')
             or status in ('SUBMITTED', 'RESUBMITTED', 'NEEDS_SUPPLEMENT')
           )
         group by claimed_by
       ),
       last_audits as (
         select
           actor_email::text as email,
           max(created_at) as last_audit_at
         from public.audit_logs
         where action in (
           'SUBMISSION_CLAIMED',
           'SUBMISSION_FORCE_CLAIMED',
           'SUBMISSION_TRANSFERRED',
           'SUBMISSION_WORKING_PAYLOAD_EDITED',
           'WORKING_PAYLOAD_UPDATED',
           'OFFICIAL_ACCEPTANCE_STARTED',
           'OFFICIAL_ACCEPTANCE_COMPLETED'
         )
         group by actor_email
       )
       select
         u.email,
         u.display_name,
         u.roles,
         u.active,
         coalesce(c.claimed_count, 0) as claimed_count,
         coalesce(ip.in_progress_count, 0) as in_progress_count,
         coalesce(cmp.completed_count, 0) as completed_count,
         c.last_claim_at,
         cmp.last_completion_at,
         ip.last_sub_updated_at,
         la.last_audit_at
       from all_users u
       left join claims c on u.email = c.email
       left join completions cmp on u.email = cmp.email
       left join current_in_progress ip on u.email = ip.email
       left join last_audits la on u.email = la.email
       where ($3::text is null or u.email = $3)
       order by u.display_name, u.email`,
      [
        fromDate?.toISOString() || null,
        toDate?.toISOString() || null,
        input.officer || null,
      ],
    );

    const officers: DashboardSummaryOfficerMetrics[] = (accountRows || []).map((row) => {
      const claimedCount = Number(row.claimed_count || 0);
      const inProgressCount = Number(row.in_progress_count || 0);
      const completedCount = Number(row.completed_count || 0);

      const completionRate =
        claimedCount === 0 ? "0%" : `${Math.round((completedCount / claimedCount) * 100)}%`;

      const timestamps = [
        row.last_claim_at ? new Date(row.last_claim_at).getTime() : 0,
        row.last_completion_at ? new Date(row.last_completion_at).getTime() : 0,
        row.last_audit_at ? new Date(row.last_audit_at).getTime() : 0,
        row.last_sub_updated_at ? new Date(row.last_sub_updated_at).getTime() : 0,
      ].filter((t) => t > 0);

      const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : null;
      const lastActivity = maxTime ? new Date(maxTime).toISOString() : null;

      return {
        email: row.email,
        displayName: row.display_name,
        roles: Array.isArray(row.roles) ? row.roles : [],
        active: Boolean(row.active),
        claimedCount,
        inProgressCount,
        completedCount,
        completionRate,
        lastActivity,
        total: claimedCount,
        inProgress: inProgressCount,
        accepted: completedCount,
      };
    });

    return {
      totals: { total, pending, inProgress, accepted, unassigned },
      statusBreakdown,
      officers,
    };
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
        claimed_by_display_name: string | null;
        updated_at: Date;
        legacy_row_index: string | number;
      }[]
    >`
      select submission_id, receipt_code::text, status, phone, version, claimed_by,
        claimed_by_display_name, updated_at, legacy_row_index
      from public.public_submissions order by legacy_row_index
    `;
    return rows.map((row) => ({
      submissionId: row.submission_id,
      receiptCode: row.receipt_code,
      status: row.status,
      phone: row.phone,
      version: row.version,
      claimedBy: row.claimed_by ?? "",
      claimedByDisplayName: row.claimed_by_display_name ?? "",
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
    return rows.map((row) =>
      serializePublicTimelineEvent({
        eventId: row.event_id,
        eventType: row.event_type,
        label: row.label,
        actorDisplayName: row.actor_display_name,
        message: row.message,
        occurredAt: row.occurred_at.toISOString(),
      }),
    );
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
    expectedVersion: number,
  ): Promise<number> {
    const database = getDatabase();
    const rows = await database<{ version: number }[]>`
      update public.public_submissions set
        draft_json = ${JSON.stringify(draft)}::jsonb,
        phone = ${draft.phone || record.phone}, status = ${status}, version = version + 1,
        updated_at = now()
      where submission_id = ${record.submissionId} and version = ${expectedVersion}
      returning version
    `;
    if (!rows[0]) throw new SubmissionVersionConflictError();
    return rows[0].version;
  }

  /**
   * Drive file này đã được cơ sở dữ liệu nhận vào chưa?
   *
   * Dùng để quyết định có được xóa tệp trên Drive khi đường ghi hỏng hay không. Đọc **mọi** trạng
   * thái, kể cả `REPLACED`/`DELETED`: một tệp đã bị thay vẫn là tệp đã từng được nhận, và xóa nó
   * khỏi Drive sẽ làm mất bằng chứng của hồ sơ.
   *
   * CỐ Ý KHÔNG lọc theo `submission_id`. Câu hỏi cần trả lời trước khi xóa là "có hồ sơ NÀO đang
   * trỏ vào tệp này không", không phải "hồ sơ đang gọi có trỏ vào nó không". Lọc theo hồ sơ gọi
   * thì một `driveFileId` do client gửi lên trỏ sang hồ sơ khác sẽ bị coi là mồ côi và bị xóa —
   * mất bằng chứng của một hộ dân không liên quan. `driveFileId` tại các nhánh dọn dẹp trong
   * `uploads/complete` là dữ liệu client chưa qua xác minh, nên hàng rào phải nằm ở đây.
   */
  async isDriveFileAdopted(driveFileId: string): Promise<boolean> {
    const database = getDatabase();
    const rows = await database<{ count: string }[]>`
      select count(*)::text as count from public.public_files
      where drive_file_id = ${driveFileId}
    `;
    return Number(rows[0]?.count ?? "0") > 0;
  }

  /**
   * Ghi một lượt tải vào bảng số đo. Best-effort ở phía gọi — hàm này vẫn ném lỗi để bên gọi tự
   * quyết định nuốt, chứ không tự nuốt ở đây (nuốt trong repository là cách chắc chắn để một bảng
   * hỏng nằm im hàng tháng mà không ai biết).
   *
   * Trần `MAX_UPLOAD_ATTEMPTS_PER_SUBMISSION` áp ngay trong câu lệnh, không phải một lượt `select`
   * riêng: `/uploads/metrics` nhận số đo của các lượt HỎNG nên không có gì buộc client phải dừng,
   * và một phiên hợp lệ có thể bắn bao nhiêu bản ghi tùy ý. Một hộ dân thật tối đa vài chục lượt
   * kể cả khi mạng rất tệ, nên trần này không chạm dữ liệu thật; nó chỉ chặn việc bơm hàng loạt
   * dòng rác vào cơ sở dữ liệu.
   */
  async appendUploadAttempt(metric: UploadAttemptMetric): Promise<void> {
    const database = getDatabase();
    await database`
      insert into public.public_upload_attempts (
        attempt_id, submission_id, document_type, outcome, source_size_bytes, upload_size_bytes,
        prepare_duration_ms, initiate_duration_ms, upload_duration_ms, complete_duration_ms,
        retry_count, client_platform, effective_connection_type, normalization_version,
        failure_stage, failure_code
      )
      select
        ${metric.attemptId}, ${metric.submissionId}, ${metric.documentType}, ${metric.outcome},
        ${metric.sourceSizeBytes}, ${metric.uploadSizeBytes},
        ${metric.prepareDurationMs}, ${metric.initiateDurationMs},
        ${metric.uploadDurationMs}, ${metric.completeDurationMs},
        ${metric.retryCount}, ${metric.clientPlatform}, ${metric.effectiveConnectionType},
        ${metric.normalizationVersion}, ${metric.failureStage}, ${metric.failureCode}
      where (
        select count(*) from public.public_upload_attempts
        where submission_id = ${metric.submissionId}
      ) < ${MAX_UPLOAD_ATTEMPTS_PER_SUBMISSION}
      on conflict (attempt_id) do nothing
    `;
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
    normalization?: FileNormalizationMetadata,
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
          size_bytes, checksum_sha256, file_name,
          source_size_bytes, source_mime_type, source_width, source_height,
          upload_width, upload_height, normalization_version
        ) values (
          ${file.fileId}, ${file.submissionId}, ${file.ownerId}, ${file.documentType},
          ${file.driveFileId}, ${file.mimeType}, ${file.sizeBytes}, ${file.checksum}, ${file.fileName},
          ${normalization?.sourceSizeBytes ?? null}, ${normalization?.sourceMimeType ?? null},
          ${normalization?.sourceWidth ?? null}, ${normalization?.sourceHeight ?? null},
          ${normalization?.uploadWidth ?? null}, ${normalization?.uploadHeight ?? null},
          ${normalization?.normalizationVersion ?? ""}
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

  /**
   * Lấy đúng một ảnh còn hiệu lực. Các route phục vụ ảnh chỉ cần một tệp nhưng trước đây gọi
   * `listFiles` rồi `.find(...)` — kéo toàn bộ ảnh của hồ sơ về chỉ để bỏ đi gần hết. Điều kiện
   * `status = 'UPLOADED'` giữ đúng ngữ nghĩa mặc định của `listFiles` để hai đường không lệch nhau.
   */
  async findActiveFile(submissionId: string, fileId: string): Promise<StoredFile | null> {
    const database = getDatabase();
    const rows = await database<FileRow[]>`
      select file_id, submission_id, owner_id, document_type, drive_file_id, mime_type,
        size_bytes, checksum_sha256, file_name, status, created_at, updated_at
      from public.public_files
      where submission_id = ${submissionId}
        and file_id = ${fileId}
        and status = 'UPLOADED'
      limit 1
    `;
    return rows[0] ? mapFile(rows[0]) : null;
  }

  async markFileReplaced(submissionId: string, fileId: string): Promise<void> {
    await this.markFileStatus(submissionId, fileId, "REPLACED");
  }

  async markFileDeleted(submissionId: string, fileId: string): Promise<void> {
    await this.markFileStatus(submissionId, fileId, "DELETED");
  }

  /**
   * Sửa `owner_id` của một ảnh CCCD đang hiệu lực — vá lỗ "tải ảnh CCCD vào đúng ô nhưng gán nhầm
   * chủ sử dụng" mà cả thay ảnh lẫn gỡ ảnh đều không vá được (ô đích nếu chưa có ảnh nào thì không
   * có gì để "thay", còn "gỡ" chỉ để lại một ô trống, không đưa ảnh sang đúng chủ).
   *
   * Không dùng cho `CERTIFICATE`: ảnh GCN không gắn với một chủ sử dụng cụ thể (luôn ghi
   * `owner_id = ''` từ lúc tải lên), nên "gán lại chủ" không có nghĩa với loại này.
   *
   * Trả `"NOOP"` khi `newOwnerId` trùng chủ hiện tại — coi là thành công, không phải lỗi, để việc gọi
   * lại sau khi mất mạng giữa chừng không cần thêm cơ chế chống gửi trùng riêng.
   *
   * Ném `FileOwnerReassignConflictError` khi chủ đích đã có sẵn một ảnh cùng mặt đang hiệu lực. Cố
   * tình KHÔNG tự động đánh `REPLACED` ảnh đó như `appendFile` làm khi thay ảnh: ảnh đang có ở ô đích
   * có thể đang đúng, và đây là thao tác sửa nhãn chứ không phải "tôi vừa chụp ảnh mới". Bắt cán bộ
   * xử lý ảnh đang chiếm chỗ trước (gỡ hoặc thay) thay vì âm thầm đẩy nó xuống lịch sử.
   */
  /**
   * Khóa hồ sơ rồi kiểm lại quyền sửa của cán bộ **bên trong transaction**.
   *
   * `for update` ở đây là hàng rào chính của cả ba thao tác ảnh của cán bộ (tải thêm, gỡ, gán lại
   * chủ). Không có nó thì mọi lượt ghi chỉ dựa vào lần kiểm ở route — và giữa lần kiểm đó với lúc
   * ghi thật, hồ sơ có thể đã `ACCEPTED`, đã chuyển cho cán bộ khác hay đã trả về hàng chờ.
   *
   * Khóa hàng này cũng là cái **tuần tự hóa hai lượt tải ảnh đồng thời** của cán bộ: lượt thứ hai
   * chờ lượt thứ nhất commit rồi mới đếm lại ảnh và dung lượng, nên không thể cùng nhìn thấy "còn
   * chỗ" rồi cùng vượt trần.
   *
   * Thứ tự khóa **luôn là hồ sơ trước, ảnh sau** ở cả ba phương thức — đổi thứ tự ở một chỗ là mở
   * đường cho deadlock giữa chúng.
   */
  private async lockSubmissionForStaffEdit(
    transaction: Sql,
    submissionId: string,
    actorEmail: string,
  ): Promise<SubmissionRecord> {
    const rows = await transaction.unsafe<SubmissionRow[]>(
      `select ${SUBMISSION_SELECT} from public.public_submissions
       where submission_id = $1 for update`,
      [submissionId],
    );
    if (!rows[0]) {
      throw new OfficerFileMutationRejectedError("NOT_FOUND", "Không tìm thấy bản kê khai.");
    }
    const record = mapSubmission(rows[0]);
    if (!mayStaffEditState(record, actorEmail)) {
      throw new OfficerFileMutationRejectedError(
        "FORBIDDEN",
        "Hồ sơ không còn do bạn nhận xử lý ở trạng thái Đang kiểm tra. Hãy tải lại trang.",
      );
    }
    return record;
  }

  /** Ảnh còn hiệu lực của hồ sơ, đã khóa hàng — dùng để kiểm lại trần và ô CCCD trong transaction. */
  private async lockActiveFiles(transaction: Sql, submissionId: string): Promise<StoredFile[]> {
    const rows = await transaction<FileRow[]>`
      select file_id, submission_id, owner_id, document_type, drive_file_id, mime_type,
        size_bytes, checksum_sha256, file_name, status, created_at, updated_at
      from public.public_files
      where submission_id = ${submissionId} and status = 'UPLOADED'
      order by created_at, file_id
      for update
    `;
    return rows.map(mapFile);
  }

  /**
   * Cán bộ nhận một ảnh vừa tải lên Drive vào hồ sơ — **một transaction duy nhất** cho toàn bộ:
   * replay idempotency, kiểm quyền/trạng thái, kiểm trần số ảnh và dung lượng bằng dữ liệu thật,
   * ghi ảnh, làm mới `file_summary_json`, ghi audit và ghi `request_log`.
   *
   * Vì sao phải cùng một transaction (trước đây route gọi `appendFile` rồi `appendAudit` riêng):
   * `appendFile` commit ảnh xong, nếu ghi audit lỗi thì route trả 500 **nhưng ảnh đã vào hồ sơ**;
   * client gọi lại thì nhánh replay trả thành công và dòng audit thiếu đó không bao giờ được ghi
   * lại. Kết quả là ảnh có trong hồ sơ mà nhật ký không biết cán bộ nào thêm.
   *
   * Trần dung lượng tính bằng `file.sizeBytes` **đã xác minh trên Drive**, không phải `sizeBytes`
   * client khai lúc `initiate` — client khai bao nhiêu cũng được, chỉ byte thật mới tính.
   */
  async commitOfficerFileUpload(input: {
    readonly submissionId: string;
    readonly actorEmail: string;
    readonly requestId: string;
    readonly idempotencyKey: string;
    readonly mutationHash: string;
    readonly documentType: StoredFile["documentType"];
    readonly ownerId: string;
    readonly replaceFileId: string;
    readonly file: {
      readonly fileId: string;
      readonly driveFileId: string;
      readonly mimeType: string;
      readonly sizeBytes: number;
      readonly checksum: string;
      readonly fileName: string;
    };
  }): Promise<{ readonly summary: PublicFileSummary; readonly replayed: boolean }> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string; response_json: unknown }[]>`
        select mutation_hash, response_json from public.request_log
        where idempotency_key = ${input.idempotencyKey} and kind = 'OFFICER_UPLOAD_COMPLETE'
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== input.mutationHash) {
          throw new SubmissionIdempotencyConflictError();
        }
        return {
          summary: parseStoredUploadReplaySummary(cached[0].response_json),
          replayed: true,
        };
      }

      const record = await this.lockSubmissionForStaffEdit(
        transaction,
        input.submissionId,
        input.actorEmail,
      );
      const files = await this.lockActiveFiles(transaction, input.submissionId);

      const replaceTarget = input.replaceFileId
        ? files.find((file) => file.fileId === input.replaceFileId)
        : undefined;
      if (input.replaceFileId && !replaceTarget) {
        throw new OfficerFileMutationRejectedError(
          "REPLACE_TARGET_INVALID",
          "Ảnh cần thay không còn hợp lệ. Hãy tải lại trang.",
        );
      }
      if (replaceTarget && replaceTarget.documentType !== input.documentType) {
        throw new OfficerFileMutationRejectedError(
          "REPLACE_TARGET_INVALID",
          "Ảnh cần thay không cùng loại giấy tờ.",
        );
      }

      if (input.documentType === "CERTIFICATE") {
        if (input.ownerId !== "") {
          throw new OfficerFileMutationRejectedError(
            "OWNER_INVALID",
            "Ảnh Giấy chứng nhận không được gắn với cá nhân.",
          );
        }
        const certificateCount = files.filter((file) => file.documentType === "CERTIFICATE").length;
        if (!replaceTarget && certificateCount >= MAX_CERTIFICATE_PHOTOS) {
          throw new OfficerFileMutationRejectedError(
            "CERTIFICATE_LIMIT",
            `Tối đa ${MAX_CERTIFICATE_PHOTOS} ảnh Giấy chứng nhận.`,
          );
        }
      } else {
        /*
         * Chủ sử dụng đọc từ **lớp dữ liệu đang có hiệu lực** của bản ghi vừa khóa, không từ
         * `draft_json`: khi hồ sơ đã được nhận xử lý thì cán bộ làm việc trên `working_payload`, v�
         * chủ sử dụng cán bộ vừa thêm ở Bàn làm việc chỉ tồn tại ở lớp đó.
         */
        const owners = effectivePayload(record)?.owners;
        const owner = Array.isArray(owners)
          ? owners.find((candidate) => candidate.id === input.ownerId)
          : undefined;
        if (!owner || !requiresCitizenId(owner.ownerType)) {
          throw new OfficerFileMutationRejectedError(
            "OWNER_INVALID",
            "Chủ sử dụng của ảnh CCCD không hợp lệ.",
          );
        }
        const existing = files.find(
          (file) => file.ownerId === input.ownerId && file.documentType === input.documentType,
        );
        /*
         * Mỗi chủ chỉ một ảnh cho từng mặt CCCD. Đòi `replaceFileId` khớp đúng ảnh đang có thay vì
         * im lặng cho ghi đè: câu `update ... REPLACED` bên dưới tự đẩy ảnh cùng chủ + cùng mặt
         * xuống lịch sử, nên một lần bấm nhầm sẽ mất bằng chứng đang dùng mà cán bộ không hề biết.
         */
        if (
          (existing && existing.fileId !== input.replaceFileId) ||
          (!existing && input.replaceFileId)
        ) {
          throw new OfficerFileMutationRejectedError(
            "SLOT_CONFLICT",
            "Trạng thái ảnh CCCD của chủ sử dụng này đã thay đổi. Hãy tải lại trang.",
          );
        }
      }

      const usedBytes =
        files.reduce((sum, file) => sum + file.sizeBytes, 0) - (replaceTarget?.sizeBytes ?? 0);
      if (usedBytes + input.file.sizeBytes > SUBMISSION_BYTE_BUDGET) {
        throw new OfficerFileMutationRejectedError(
          "BYTE_BUDGET",
          "Tổng dung lượng hồ sơ đã vượt giới hạn.",
        );
      }

      if (input.replaceFileId) {
        await transaction`
          update public.public_files set status = 'REPLACED', updated_at = now()
          where submission_id = ${input.submissionId} and file_id = ${input.replaceFileId}
            and status = 'UPLOADED'
        `;
      }
      if (input.documentType !== "CERTIFICATE") {
        await transaction`
          update public.public_files set status = 'REPLACED', updated_at = now()
          where submission_id = ${input.submissionId} and owner_id = ${input.ownerId}
            and document_type = ${input.documentType} and status = 'UPLOADED'
        `;
      }

      const rows = await transaction<FileRow[]>`
        insert into public.public_files (
          file_id, submission_id, owner_id, document_type, drive_file_id, mime_type,
          size_bytes, checksum_sha256, file_name
        ) values (
          ${input.file.fileId}, ${input.submissionId}, ${input.ownerId}, ${input.documentType},
          ${input.file.driveFileId}, ${input.file.mimeType}, ${input.file.sizeBytes},
          ${input.file.checksum}, ${input.file.fileName}
        ) returning file_id, submission_id, owner_id, document_type, drive_file_id, mime_type,
          size_bytes, checksum_sha256, file_name, status, created_at, updated_at
      `;
      await this.refreshFileSummaries(transaction, input.submissionId);
      const summary = this.fileSummary(mapFile(rows[0]));

      /*
       * Dấu vết ai bổ sung ảnh nào. Metadata chỉ gồm danh mục đóng và số — `documentType`,
       * `fileId`, `sizeBytes` và có thay ảnh hay không. Không ghi tên tệp, không ghi `driveFileId`,
       * không ghi `ownerId` kèm bất cứ thông tin định danh nào (02-coding-rules).
       */
      await this.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: "SUBMISSION_OFFICER_FILE_UPLOADED",
        entityId: input.submissionId,
        requestId: input.requestId,
        metadata: {
          documentType: input.documentType,
          fileId: summary.fileId,
          sizeBytes: input.file.sizeBytes,
          replaced: Boolean(input.replaceFileId),
        },
      });

      await transaction`
        insert into public.request_log (
          idempotency_key, kind, request_id, mutation_hash, response_json, expires_at
        ) values (
          ${input.idempotencyKey}, 'OFFICER_UPLOAD_COMPLETE', ${input.requestId},
          ${input.mutationHash}, ${transaction.json(serializeFileSummary(summary))}, now() + interval '24 hours'
        )
      `;

      return { summary, replayed: false };
    });
  }

  /**
   * Cán bộ gỡ một ảnh Giấy chứng nhận khỏi hồ sơ (xóa mềm) — quyền, trạng thái, đổi trạng thái ảnh,
   * làm mới `file_summary_json` và audit trong **một** transaction.
   *
   * Không cần `idempotency-key`: gọi lại khi ảnh đã `DELETED` là no-op và **không ghi audit lần
   * hai**, nhưng lần đầu thì audit không thể thiếu — trước đây audit nằm ngoài transaction nên ảnh
   * có thể đã bị gỡ mà nhật ký không ghi ai gỡ.
   */
  async commitOfficerFileDelete(input: {
    readonly submissionId: string;
    readonly fileId: string;
    readonly actorEmail: string;
    readonly requestId: string;
  }): Promise<{ readonly alreadyDeleted: boolean }> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      await this.lockSubmissionForStaffEdit(transaction, input.submissionId, input.actorEmail);

      const current = await transaction<
        {
          document_type: StoredFile["documentType"];
          status: StoredFile["status"];
          size_bytes: number;
        }[]
      >`
        select document_type, status, size_bytes from public.public_files
        where submission_id = ${input.submissionId} and file_id = ${input.fileId}
        for update
      `;
      if (!current[0]) {
        throw new OfficerFileMutationRejectedError("FILE_NOT_FOUND", "Không tìm thấy ảnh cần gỡ.");
      }
      if (current[0].document_type !== "CERTIFICATE") {
        throw new OfficerFileMutationRejectedError(
          "DOCUMENT_TYPE_INVALID",
          "Chỉ gỡ được ảnh Giấy chứng nhận. Ảnh CCCD dùng chức năng thay ảnh.",
        );
      }
      // `REPLACED` đã ra khỏi bộ ảnh hiệu lực bằng luồng thay ảnh — không phải việc của đây.
      if (current[0].status === "REPLACED") {
        throw new OfficerFileMutationRejectedError("FILE_INACTIVE", "Ảnh không còn hiệu lực.");
      }
      if (current[0].status === "DELETED") return { alreadyDeleted: true };

      await transaction`
        update public.public_files set status = 'DELETED', updated_at = now()
        where submission_id = ${input.submissionId} and file_id = ${input.fileId}
      `;
      await this.refreshFileSummaries(transaction, input.submissionId);
      // Metadata chỉ danh mục đóng và số, không tên tệp / Drive ID / ownerId.
      await this.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: "SUBMISSION_OFFICER_FILE_DELETED",
        entityId: input.submissionId,
        requestId: input.requestId,
        metadata: {
          documentType: current[0].document_type,
          fileId: input.fileId,
          sizeBytes: current[0].size_bytes,
        },
      });
      return { alreadyDeleted: false };
    });
  }

  /**
   * Cán bộ gán lại chủ sử dụng cho một ảnh CCCD — quyền, trạng thái, chủ đích, chống tranh chấp ô
   * đích, cập nhật ảnh, làm mới `file_summary_json` và audit trong **một** transaction.
   */
  async commitOfficerFileOwnerReassign(input: {
    readonly submissionId: string;
    readonly fileId: string;
    readonly newOwnerId: string;
    readonly actorEmail: string;
    readonly requestId: string;
  }): Promise<"REASSIGNED" | "NOOP"> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      const record = await this.lockSubmissionForStaffEdit(
        transaction,
        input.submissionId,
        input.actorEmail,
      );

      const current = await transaction<
        {
          owner_id: string;
          document_type: StoredFile["documentType"];
          status: StoredFile["status"];
        }[]
      >`
        select owner_id, document_type, status from public.public_files
        where submission_id = ${input.submissionId} and file_id = ${input.fileId}
        for update
      `;
      if (!current[0]) {
        throw new OfficerFileMutationRejectedError(
          "FILE_NOT_FOUND",
          "Không tìm thấy ảnh cần gán lại.",
        );
      }
      if (current[0].status !== "UPLOADED") {
        throw new OfficerFileMutationRejectedError("FILE_INACTIVE", "Ảnh không còn hiệu lực.");
      }
      if (current[0].document_type === "CERTIFICATE") {
        throw new OfficerFileMutationRejectedError(
          "DOCUMENT_TYPE_INVALID",
          "Chỉ gán lại chủ sử dụng cho ảnh CCCD. Ảnh Giấy chứng nhận không gắn với một chủ cụ thể.",
        );
      }
      if (current[0].owner_id === input.newOwnerId) return "NOOP";

      // Chủ đích đọc từ lớp dữ liệu đang có hiệu lực của bản ghi vừa khóa — cùng quy tắc với đường
      // tải ảnh: chủ do cán bộ thêm ở Bàn làm việc chỉ tồn tại ở `working_payload`.
      const owners = effectivePayload(record)?.owners;
      const targetOwner = Array.isArray(owners)
        ? owners.find((candidate) => candidate.id === input.newOwnerId)
        : undefined;
      if (!targetOwner || !requiresCitizenId(targetOwner.ownerType)) {
        throw new OfficerFileMutationRejectedError(
          "OWNER_INVALID",
          "Chủ sử dụng đích không hợp lệ.",
        );
      }

      // Khóa luôn hàng của chủ đích trong cùng transaction — hai yêu cầu gán lại đồng thời vào cùng
      // một ô không được cùng thấy "còn trống" rồi cùng ghi đè lên nhau.
      const collision = await transaction<{ file_id: string }[]>`
        select file_id from public.public_files
        where submission_id = ${input.submissionId} and owner_id = ${input.newOwnerId}
          and document_type = ${current[0].document_type} and status = 'UPLOADED'
        for update
      `;
      if (collision[0]) throw new FileOwnerReassignConflictError();

      await transaction`
        update public.public_files set owner_id = ${input.newOwnerId}, updated_at = now()
        where submission_id = ${input.submissionId} and file_id = ${input.fileId}
      `;
      await this.refreshFileSummaries(transaction, input.submissionId);
      // Metadata chỉ danh mục đóng và số, không ownerId (cùng quy tắc với các audit khác của 2C).
      await this.insertAudit(transaction, {
        actorEmail: input.actorEmail,
        action: "SUBMISSION_OFFICER_FILE_OWNER_REASSIGNED",
        entityId: input.submissionId,
        requestId: input.requestId,
        metadata: { documentType: current[0].document_type, fileId: input.fileId },
      });
      return "REASSIGNED";
    });
  }

  private async lockSubmissionForPublicEdit(
    transaction: Sql,
    submissionId: string,
  ): Promise<SubmissionRecord> {
    const rows = await transaction.unsafe<SubmissionRow[]>(
      `select ${SUBMISSION_SELECT} from public.public_submissions
       where submission_id = $1 for update`,
      [submissionId],
    );
    if (!rows[0]) {
      throw new PublicFileMutationRejectedError("NOT_FOUND", "Không tìm thấy bản kê khai.");
    }
    const record = mapSubmission(rows[0]);
    if (
      record.claimedBy.trim().length > 0 ||
      (record.status !== "DRAFT" && record.status !== "NEEDS_SUPPLEMENT")
    ) {
      throw new PublicFileMutationRejectedError(
        "INVALID_STATE",
        "Bản kê khai đang bị khóa hoặc không ở trạng thái cho phép sửa.",
      );
    }
    return record;
  }

  async commitPublicFileUpload(input: {
    readonly submissionId: string;
    readonly requestId: string;
    readonly idempotencyKey: string;
    readonly mutationHash: string;
    readonly documentType: StoredFile["documentType"];
    readonly ownerId: string;
    readonly replaceFileId: string;
    readonly file: {
      readonly fileId: string;
      readonly driveFileId: string;
      readonly mimeType: string;
      readonly sizeBytes: number;
      readonly checksum: string;
      readonly fileName: string;
    };
    readonly normalization?: FileNormalizationMetadata;
  }): Promise<{ readonly summary: PublicFileSummary; readonly replayed: boolean }> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string; response_json: unknown }[]>`
        select mutation_hash, response_json from public.request_log
        where idempotency_key = ${input.idempotencyKey} and kind = 'PUBLIC_UPLOAD_COMPLETE'
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== input.mutationHash) {
          throw new SubmissionIdempotencyConflictError();
        }
        return {
          summary: parseStoredUploadReplaySummary(cached[0].response_json),
          replayed: true,
        };
      }

      const record = await this.lockSubmissionForPublicEdit(transaction, input.submissionId);
      if (!record.driveFolderId) {
        throw new PublicFileMutationRejectedError(
          "INVALID_STATE",
          "Thư mục tải ảnh chưa sẵn sàng. Vui lòng tải lại ảnh từ đầu.",
        );
      }
      const files = await this.lockActiveFiles(transaction, input.submissionId);

      const replaceTarget = input.replaceFileId
        ? files.find((file) => file.fileId === input.replaceFileId)
        : undefined;
      if (input.replaceFileId && !replaceTarget) {
        throw new PublicFileMutationRejectedError(
          "REPLACE_TARGET_INVALID",
          "Ảnh cần thay không còn hợp lệ. Hãy tải lại trang.",
        );
      }
      if (replaceTarget && replaceTarget.documentType !== input.documentType) {
        throw new PublicFileMutationRejectedError(
          "REPLACE_TARGET_INVALID",
          "Ảnh cần thay không cùng loại giấy tờ.",
        );
      }

      if (input.documentType === "CERTIFICATE") {
        if (input.ownerId !== "") {
          throw new PublicFileMutationRejectedError(
            "OWNER_INVALID",
            "Ảnh Giấy chứng nhận không được gắn với cá nhân.",
          );
        }
        const certificateCount = files.filter((file) => file.documentType === "CERTIFICATE").length;
        if (!replaceTarget && certificateCount >= MAX_CERTIFICATE_PHOTOS) {
          throw new PublicFileMutationRejectedError(
            "CERTIFICATE_LIMIT",
            `Tối đa ${MAX_CERTIFICATE_PHOTOS} ảnh Giấy chứng nhận.`,
          );
        }
      } else {
        const owners = record.draft?.owners;
        const owner = Array.isArray(owners)
          ? owners.find((candidate) => candidate.id === input.ownerId)
          : undefined;
        if (!owner || !requiresCitizenId(owner.ownerType)) {
          throw new PublicFileMutationRejectedError(
            "OWNER_INVALID",
            "Chủ sử dụng của ảnh CCCD không hợp lệ.",
          );
        }
        const existing = files.find(
          (file) => file.ownerId === input.ownerId && file.documentType === input.documentType,
        );
        if (
          (existing && existing.fileId !== input.replaceFileId) ||
          (!existing && input.replaceFileId)
        ) {
          throw new PublicFileMutationRejectedError(
            "SLOT_CONFLICT",
            "Trạng thái thay ảnh CCCD không còn hợp lệ.",
          );
        }
      }

      const usedBytes =
        files.reduce((sum, file) => sum + file.sizeBytes, 0) - (replaceTarget?.sizeBytes ?? 0);
      if (usedBytes + input.file.sizeBytes > SUBMISSION_BYTE_BUDGET) {
        throw new PublicFileMutationRejectedError(
          "BYTE_BUDGET",
          "Tổng dung lượng hồ sơ đã vượt giới hạn.",
        );
      }

      if (input.replaceFileId) {
        await transaction`
          update public.public_files set status = 'REPLACED', updated_at = now()
          where submission_id = ${input.submissionId} and file_id = ${input.replaceFileId}
            and status = 'UPLOADED'
        `;
      }
      if (input.documentType !== "CERTIFICATE") {
        await transaction`
          update public.public_files set status = 'REPLACED', updated_at = now()
          where submission_id = ${input.submissionId} and owner_id = ${input.ownerId}
            and document_type = ${input.documentType} and status = 'UPLOADED'
        `;
      }

      const rows = await transaction<FileRow[]>`
        insert into public.public_files (
          file_id, submission_id, owner_id, document_type, drive_file_id, mime_type,
          size_bytes, checksum_sha256, file_name,
          source_size_bytes, source_mime_type, source_width, source_height,
          upload_width, upload_height, normalization_version
        ) values (
          ${input.file.fileId}, ${input.submissionId}, ${input.ownerId}, ${input.documentType},
          ${input.file.driveFileId}, ${input.file.mimeType}, ${input.file.sizeBytes},
          ${input.file.checksum}, ${input.file.fileName},
          ${input.normalization?.sourceSizeBytes ?? null}, ${input.normalization?.sourceMimeType ?? null},
          ${input.normalization?.sourceWidth ?? null}, ${input.normalization?.sourceHeight ?? null},
          ${input.normalization?.uploadWidth ?? null}, ${input.normalization?.uploadHeight ?? null},
          ${input.normalization?.normalizationVersion ?? ""}
        ) returning file_id, submission_id, owner_id, document_type, drive_file_id, mime_type,
          size_bytes, checksum_sha256, file_name, status, created_at, updated_at
      `;
      await this.refreshFileSummaries(transaction, input.submissionId);
      const summary = this.fileSummary(mapFile(rows[0]));

      await this.insertAudit(transaction, {
        actorEmail: "PUBLIC",
        action: "PUBLIC_FILE_UPLOADED",
        entityId: input.submissionId,
        requestId: input.requestId,
        metadata: {
          documentType: input.documentType,
          fileId: summary.fileId,
          sizeBytes: input.file.sizeBytes,
          replaced: Boolean(input.replaceFileId),
        },
      });

      await transaction`
        insert into public.request_log (
          idempotency_key, kind, request_id, mutation_hash, response_json, expires_at
        ) values (
          ${input.idempotencyKey}, 'PUBLIC_UPLOAD_COMPLETE', ${input.requestId},
          ${input.mutationHash}, ${JSON.stringify(summary)}::jsonb, now() + interval '24 hours'
        )
      `;

      return { summary, replayed: false };
    });
  }

  async commitPublicFileDelete(input: {
    readonly submissionId: string;
    readonly fileId: string;
    readonly requestId: string;
    readonly idempotencyKey: string;
    readonly mutationHash: string;
  }): Promise<{ readonly alreadyDeleted: boolean }> {
    const database = getDatabase();
    return database.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
      const cached = await transaction<{ mutation_hash: string; response_json: unknown }[]>`
        select mutation_hash, response_json from public.request_log
        where idempotency_key = ${input.idempotencyKey}
      `;
      if (cached[0]) {
        if (cached[0].mutation_hash !== input.mutationHash) {
          throw new SubmissionIdempotencyConflictError();
        }
        return { alreadyDeleted: true };
      }

      await this.lockSubmissionForPublicEdit(transaction, input.submissionId);

      const current = await transaction<
        {
          document_type: StoredFile["documentType"];
          status: StoredFile["status"];
          size_bytes: number;
        }[]
      >`
        select document_type, status, size_bytes from public.public_files
        where submission_id = ${input.submissionId} and file_id = ${input.fileId}
        for update
      `;
      if (!current[0]) {
        throw new PublicFileMutationRejectedError("FILE_NOT_FOUND", "Không tìm thấy ảnh cần xóa.");
      }
      if (current[0].document_type !== "CERTIFICATE") {
        throw new PublicFileMutationRejectedError(
          "DOCUMENT_TYPE_INVALID",
          "Chỉ xóa được ảnh Giấy chứng nhận.",
        );
      }
      if (current[0].status === "REPLACED") {
        throw new PublicFileMutationRejectedError("FILE_INACTIVE", "Ảnh không còn hiệu lực.");
      }
      if (current[0].status === "DELETED") return { alreadyDeleted: true };

      await transaction`
        update public.public_files set status = 'DELETED', updated_at = now()
        where submission_id = ${input.submissionId} and file_id = ${input.fileId}
      `;
      await this.refreshFileSummaries(transaction, input.submissionId);
      await this.insertAudit(transaction, {
        actorEmail: "PUBLIC",
        action: "PUBLIC_FILE_DELETED",
        entityId: input.submissionId,
        requestId: input.requestId,
        metadata: {
          documentType: current[0].document_type,
          fileId: input.fileId,
          sizeBytes: current[0].size_bytes,
        },
      });

      await transaction`
        insert into public.request_log (
          idempotency_key, kind, request_id, mutation_hash, response_json, expires_at
        ) values (
          ${input.idempotencyKey}, 'PUBLIC_FILE_DELETE', ${input.requestId},
          ${input.mutationHash}, '{"alreadyDeleted":true}'::jsonb, now() + interval '24 hours'
        )
      `;
      return { alreadyDeleted: false };
    });
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
          accept_step = null, claimed_by = null, claimed_by_display_name = null,
          claimed_at = null, updated_at = now()
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
      set file_summary_json = ${sql.json(summaries.map(serializeFileSummary))}, updated_at = now()
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
          organisation_name, organisation_identity_number,
          date_of_birth, gender, residence_address, identity_source, qr_payload_hash,
          qr_decoder_version, qr_parser_version, identity_status, identity_confirmed_at,
          identity_override_reason,
          has_distinct_current_user, current_user_name, current_user_citizen_id,
          current_user_address, change_reason
        ) values (
          ${owner.id}, ${submissionId}, ${owner.ownerType}, ${owner.fullName},
          ${owner.identityNumber}, ${owner.roleOnCertificate},
          ${owner.organisationName ?? ""}, ${owner.organisationIdentityNumber ?? ""},
          ${owner.dateOfBirth},
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
          address_on_certificate, address_two_level, area, old_ward,
          cadastral_map_sheet_number, cadastral_map_sheet_override_reason,
          cadastral_parcel_number
        ) values (
          ${parcel.id}, ${submissionId}, ${parcel.parcelIdCode},
          ${parcel.mapSheetNumber}, ${parcel.parcelNumber}, ${parcel.addressOnCertificate},
          ${parcel.addressTwoLevel}, ${parcel.area}, ${parcel.oldWard},
          ${parcel.cadastralMapSheetNumber ?? ""},
          ${parcel.cadastralMapSheetOverrideReason ?? ""},
          ${parcel.cadastralParcelNumber ?? ""}
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
        insert into public.public_assets (
          asset_id, submission_id, parcel_id, asset_type, description,
          mixed_use_building_name, apartment_building_name, apartment_number,
          construction_area, floor_area, ownership_form, ownership_term, grade
        ) values (
          ${asset.id}, ${submissionId}, ${asset.parcelId ?? null}, ${asset.assetType},
          ${asset.description}, ${asset.mixedUseBuildingName ?? ""},
          ${asset.apartmentBuildingName ?? ""}, ${asset.apartmentNumber ?? ""},
          ${asset.constructionArea ?? ""}, ${asset.floorArea ?? ""},
          ${asset.ownershipForm ?? ""}, ${asset.ownershipTerm ?? ""}, ${asset.grade ?? ""}
        )
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

export class StoredUploadReplayInvalidError extends Error {
  constructor() {
    super("Káº¿t quáº£ upload Ä‘Ã£ lÆ°u khÃ´ng há»£p lá»‡.");
    this.name = "StoredUploadReplayInvalidError";
  }
}

export class SubmissionAlreadyClaimedError extends Error {
  constructor() {
    super("Hồ sơ đang do cán bộ khác nhận xử lý.");
    this.name = "SubmissionAlreadyClaimedError";
  }
}

export class FileOwnerReassignConflictError extends Error {
  constructor() {
    super("Chủ sử dụng đích đã có ảnh cho mặt CCCD này.");
    this.name = "FileOwnerReassignConflictError";
  }
}

/**
 * Vì sao một lượt thao tác ảnh của cán bộ bị từ chối **bên trong transaction**.
 *
 * Route dịch `reason` sang mã lỗi HTTP; repository không biết gì về HTTP. Ném lỗi (chứ không trả
 * kết quả) là cố ý: mọi nhánh từ chối phải làm transaction rollback, không để lại nửa thay đổi.
 */
export type OfficerFileRejectionReason =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "OWNER_INVALID"
  | "REPLACE_TARGET_INVALID"
  | "SLOT_CONFLICT"
  | "CERTIFICATE_LIMIT"
  | "BYTE_BUDGET"
  | "FILE_NOT_FOUND"
  | "FILE_INACTIVE"
  | "DOCUMENT_TYPE_INVALID";

export class OfficerFileMutationRejectedError extends Error {
  constructor(
    readonly reason: OfficerFileRejectionReason,
    message: string,
  ) {
    super(message);
    this.name = "OfficerFileMutationRejectedError";
  }
}

export type PublicFileRejectionReason =
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "OWNER_INVALID"
  | "REPLACE_TARGET_INVALID"
  | "SLOT_CONFLICT"
  | "CERTIFICATE_LIMIT"
  | "BYTE_BUDGET"
  | "FILE_NOT_FOUND"
  | "FILE_INACTIVE"
  | "DOCUMENT_TYPE_INVALID";

export class PublicFileMutationRejectedError extends Error {
  constructor(
    readonly reason: PublicFileRejectionReason,
    message: string,
  ) {
    super(message);
    this.name = "PublicFileMutationRejectedError";
  }
}

type JsonScalar = string | number | boolean | null;
type JsonRecord = Record<string, JsonScalar>;

export function parseStoredUploadReplaySummary(value: unknown): PublicFileSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StoredUploadReplayInvalidError();
  }
  const summary = value as Record<string, unknown>;
  const documentTypes = new Set(["CITIZEN_ID_FRONT", "CITIZEN_ID_BACK", "CERTIFICATE"]);
  const statuses = new Set(["UPLOADED", "REPLACED", "DELETED"]);
  const optionalStringsAreValid = ["driveFileId", "mimeType"].every(
    (key) =>
      summary[key] === undefined || summary[key] === null || typeof summary[key] === "string",
  );
  const rowIndexIsValid =
    summary.rowIndex === undefined ||
    (typeof summary.rowIndex === "number" &&
      Number.isInteger(summary.rowIndex) &&
      summary.rowIndex >= 0);

  if (
    typeof summary.fileId !== "string" ||
    summary.fileId.trim().length === 0 ||
    typeof summary.ownerId !== "string" ||
    typeof summary.documentType !== "string" ||
    !documentTypes.has(summary.documentType) ||
    typeof summary.status !== "string" ||
    !statuses.has(summary.status) ||
    typeof summary.sizeBytes !== "number" ||
    !Number.isInteger(summary.sizeBytes) ||
    summary.sizeBytes < 0 ||
    typeof summary.checksum !== "string" ||
    typeof summary.createdAt !== "string" ||
    typeof summary.updatedAt !== "string" ||
    !optionalStringsAreValid ||
    !rowIndexIsValid
  ) {
    throw new StoredUploadReplayInvalidError();
  }

  return {
    fileId: summary.fileId,
    ownerId: summary.ownerId,
    documentType: summary.documentType as PublicFileSummary["documentType"],
    status: summary.status as PublicFileSummary["status"],
    sizeBytes: summary.sizeBytes,
    checksum: summary.checksum,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    ...(typeof summary.driveFileId === "string" ? { driveFileId: summary.driveFileId } : {}),
    ...(typeof summary.mimeType === "string" ? { mimeType: summary.mimeType } : {}),
    ...(typeof summary.rowIndex === "number" ? { rowIndex: summary.rowIndex } : {}),
  };
}

function serializeFileSummary(summary: PublicFileSummary): JsonRecord {
  return {
    fileId: summary.fileId,
    ownerId: summary.ownerId,
    documentType: summary.documentType,
    status: summary.status,
    sizeBytes: summary.sizeBytes,
    checksum: summary.checksum,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    driveFileId: summary.driveFileId ?? null,
    mimeType: summary.mimeType ?? null,
  };
}