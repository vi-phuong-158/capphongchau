import { randomUUID } from "node:crypto";

import { effectivePayload, payloadLayerOf } from "@/modules/public-intake/payload-layers";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";

import type { StaffSubmissionDetail } from "./detail-types";

/**
 * Đọc hồ sơ cho màn duyệt, **có ghi audit**.
 *
 * Mỗi lần gọi với `auditDetailView` ghi một dòng `SUBMISSION_SENSITIVE_DETAIL_VIEWED`: đây là đường
 * xem dữ liệu nhạy cảm (số điện thoại, CCCD, địa chỉ) nên dấu vết "ai đã xem hồ sơ nào" là bắt buộc.
 * Khi nạp sẵn trên server, việc dựng dữ liệu **không được** làm mất dòng audit này — vì thế audit
 * nằm trong hàm dùng chung chứ không nằm ở route.
 *
 * Hai lượt đọc chạy song song bằng `Promise.all`: `findById` và `listFiles` không phụ thuộc nhau,
 * nối tiếp chúng chỉ cộng thêm một vòng mạng vào thời gian mở hồ sơ.
 *
 * Trả `null` khi không có hồ sơ; người gọi tự quyết định 404 hay redirect.
 */
export async function loadStaffSubmissionDetail(input: {
  readonly submissionId: string;
  readonly actorEmail: string;
  readonly canResetAccessSecret: boolean;
  readonly auditDetailView: boolean;
  readonly requestId?: string;
}): Promise<StaffSubmissionDetail | null> {
  const repository = getPublicIntakeRepository();
  const [record, files] = await Promise.all([
    repository.findById(input.submissionId),
    repository.listFiles(input.submissionId),
  ]);
  if (!record) return null;

  if (input.auditDetailView) {
    await repository.appendAudit({
      actorEmail: input.actorEmail,
      action: "SUBMISSION_SENSITIVE_DETAIL_VIEWED",
      entityId: record.submissionId,
      requestId: input.requestId ?? randomUUID(),
    });
  }

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
    citizenPayload: record.citizenPayload ?? null,
    workingPayload: record.workingPayload ?? null,
    officialPayload: record.officialPayload ?? null,
    files: files.map((file) => ({
      fileId: file.fileId,
      documentType: file.documentType,
      ownerId: file.ownerId,
    })),
    canResetAccessSecret: input.canResetAccessSecret,
  };
}
