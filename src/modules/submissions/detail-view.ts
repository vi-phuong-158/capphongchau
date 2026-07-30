import { UserRole } from "@/modules/common/domain";
import { effectivePayload, payloadLayerOf } from "@/modules/public-intake/payload-layers";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import type { PayloadLayer } from "@/modules/public-intake/payload-layers";
import type { IntakeDraft } from "@/modules/public-intake/types";
import type { IntakeChannel, PublicStatus } from "@/modules/public-intake/repository";

/**
 * Dữ liệu một hồ sơ dùng cho màn duyệt của cán bộ.
 *
 * Đây là **nguồn duy nhất** của hình dạng dữ liệu này: cả `GET /api/submissions/:id` và trang
 * server `/submissions/[submissionId]` (server-priming) đều trả về đúng kiểu này, và
 * `SubmissionDetail` lấy luôn kiểu này làm kiểu prop. Trước đó hình dạng dữ liệu bị khai lại
 * trong component client, nên thêm một trường (ví dụ `internalNotes` ở Đợt 2A-2) phải sửa hai
 * nơi và rất dễ lệch.
 */
export interface SubmissionDetailView {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly status: PublicStatus;
  readonly phone: string;
  readonly version: number;
  readonly claimedBy: string | null;
  readonly claimedByDisplayName: string | null;
  readonly intakeChannel: IntakeChannel;
  readonly assistedByDisplayName: string | null;
  readonly claimedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly officialCaseId: string | null;
  readonly acceptStep: string | null;
  readonly internalNotes: string;
  readonly draft: IntakeDraft | null;
  readonly payloadLayer: PayloadLayer | "DRAFT";
  readonly citizenPayload: IntakeDraft | null;
  readonly workingPayload: IntakeDraft | null;
  readonly officialPayload: IntakeDraft | null;
  readonly files: readonly {
    readonly fileId: string;
    readonly documentType: "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
    readonly ownerId: string;
  }[];
  readonly canResetAccessSecret: boolean;
}

/**
 * Đọc hồ sơ cho màn duyệt, **có ghi audit**.
 *
 * Mỗi lần gọi ghi một dòng `SUBMISSION_SENSITIVE_DETAIL_VIEWED`: hàm này là đường xem dữ liệu
 * nhạy cảm (số điện thoại, CCCD, địa chỉ) nên dấu vết "ai đã xem hồ sơ nào" là bắt buộc. Khi
 * chuyển sang server-priming, việc dựng dữ liệu ngay trên server **không được** làm mất dòng
 * audit này — vì thế audit nằm trong hàm dùng chung chứ không nằm ở route.
 *
 * Trả `null` khi không có hồ sơ; người gọi tự quyết định 404 hay redirect.
 */
export async function loadSubmissionDetail(
  submissionId: string,
  viewer: { readonly email: string; readonly roles: readonly string[] },
  requestId: string,
): Promise<SubmissionDetailView | null> {
  const repository = getPublicIntakeRepository();
  const record = await repository.findById(submissionId);
  if (!record) return null;
  await repository.appendAudit({
    actorEmail: viewer.email,
    action: "SUBMISSION_SENSITIVE_DETAIL_VIEWED",
    entityId: record.submissionId,
    requestId,
  });
  const files = await repository.listFiles(record.submissionId);
  return {
    submissionId: record.submissionId,
    receiptCode: record.receiptCode,
    status: record.status,
    phone: record.phone,
    version: record.version,
    claimedBy: record.claimedBy || null,
    claimedByDisplayName: record.claimedByDisplayName || null,
    intakeChannel: record.intakeChannel,
    assistedByDisplayName: record.assistedByDisplayName || null,
    claimedAt: record.claimedAt || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    officialCaseId: record.officialCaseId || null,
    acceptStep: record.acceptStep || null,
    internalNotes: record.internalNotes,
    // Màn cán bộ luôn sửa/xem lớp dữ liệu đang có hiệu lực. Khi đã nhận xử lý thì đó là
    // `working_payload`, không phải `draft_json` cũ của người dân.
    draft: effectivePayload(record),
    payloadLayer: payloadLayerOf(record),
    citizenPayload: record.citizenPayload || null,
    workingPayload: record.workingPayload || null,
    officialPayload: record.officialPayload || null,
    files: files.map((file) => ({
      fileId: file.fileId,
      documentType: file.documentType,
      ownerId: file.ownerId,
    })),
    canResetAccessSecret:
      viewer.roles.includes(UserRole.SYSTEM_ADMIN) || viewer.roles.includes(UserRole.WARD_ADMIN),
  };
}
