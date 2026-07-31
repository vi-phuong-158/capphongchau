import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { isValidPublicIdempotencyKey } from "@/modules/public-intake/creation-idempotency";
import {
  getPublicIntakeRepository,
  PublicFileMutationRejectedError,
  SubmissionIdempotencyConflictError,
  type PublicFileRejectionReason,
} from "@/modules/public-intake/repository";
import {
  publicError,
  resolvePublicRequest,
  type PublicErrorCode,
} from "@/modules/public-intake/route-context";
import { getPublicIntakeStorage, PreviewUnavailableError } from "@/modules/public-intake/storage";

export const runtime = "nodejs";

const REJECTION_HTTP: Record<
  PublicFileRejectionReason,
  { readonly code: PublicErrorCode; readonly status: number }
> = {
  NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  INVALID_STATE: { code: "INVALID_STATE", status: 409 },
  OWNER_INVALID: { code: "VALIDATION_FAILED", status: 400 },
  REPLACE_TARGET_INVALID: { code: "VERSION_CONFLICT", status: 409 },
  SLOT_CONFLICT: { code: "VERSION_CONFLICT", status: 409 },
  CERTIFICATE_LIMIT: { code: "VERSION_CONFLICT", status: 409 },
  BYTE_BUDGET: { code: "VALIDATION_FAILED", status: 400 },
  FILE_NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  FILE_INACTIVE: { code: "VERSION_CONFLICT", status: 409 },
  DOCUMENT_TYPE_INVALID: { code: "VALIDATION_FAILED", status: 400 },
};

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
): Promise<NextResponse> {
  const access = await resolvePublicRequest(request, { requireCsrf: false });
  if (access instanceof NextResponse) return access;
  const { fileId } = await context.params;
  const summarized = access.record.fileSummaries.find(
    (candidate) =>
      candidate.fileId === fileId && candidate.status === "UPLOADED" && candidate.driveFileId,
  );
  const file = summarized
    ? { ...summarized, driveFileId: summarized.driveFileId! }
    : await getPublicIntakeRepository().findActiveFile(access.record.submissionId, fileId);
  if (!file) return publicError("NOT_FOUND", "Không tìm thấy ảnh đã nộp.", access.requestId);

  try {
    const preview = await getPublicIntakeStorage().readPreview(file.driveFileId);
    await getPublicIntakeRepository().appendAudit({
      actorEmail: "PUBLIC",
      action: "PUBLIC_FILE_PREVIEWED",
      entityId: access.record.submissionId,
      requestId: access.requestId,
      metadata: { fileId },
    });
    return new NextResponse(new Uint8Array(preview.bytes).buffer, {
      headers: {
        "content-type": preview.contentType,
        "cache-control": "private, no-store",
        "content-security-policy": "default-src 'none'",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof PreviewUnavailableError) {
      return publicError(
        "NOT_FOUND",
        "Chưa tạo được ảnh xem trước. Vui lòng thử lại sau.",
        access.requestId,
      );
    }
    return publicError("INTERNAL_ERROR", "Không thể tải ảnh xem trước.", access.requestId);
  }
}

/**
 * Xóa mềm một ảnh Giấy chứng nhận người dân vừa tải. Chỉ cho phép với ảnh GCN (`CERTIFICATE`) —
 * ảnh CCCD có luồng thay riêng và là ràng buộc bắt buộc, không cho xóa lẻ qua đây.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
): Promise<NextResponse> {
  const access = await resolvePublicRequest(request, { requireCsrf: true });
  if (access instanceof NextResponse) return access;

  const rawIdempotencyKey = request.headers.get("idempotency-key");
  if (!isValidPublicIdempotencyKey(rawIdempotencyKey)) {
    return publicError("VALIDATION_FAILED", "Thiếu khóa chống gửi trùng.", access.requestId);
  }

  const { fileId } = await context.params;
  const idempotencyKey = `PUBLIC_FILE_DELETE:${access.record.submissionId}:${fileId}:${rawIdempotencyKey}`;
  const mutationHash = createHash("sha256")
    .update(JSON.stringify({ submissionId: access.record.submissionId, fileId }))
    .digest("hex");

  try {
    await getPublicIntakeRepository().commitPublicFileDelete({
      submissionId: access.record.submissionId,
      fileId,
      requestId: access.requestId,
      idempotencyKey,
      mutationHash,
    });
    return NextResponse.json({ fileId, status: "DELETED" });
  } catch (error) {
    if (error instanceof PublicFileMutationRejectedError) {
      const { code } = REJECTION_HTTP[error.reason];
      return publicError(code, error.message, access.requestId);
    }
    if (error instanceof SubmissionIdempotencyConflictError) {
      return publicError("IDEMPOTENCY_CONFLICT", "Yêu cầu xóa ảnh bị xung đột.", access.requestId);
    }
    throw error;
  }
}
