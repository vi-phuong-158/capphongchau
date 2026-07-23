import { NextResponse } from "next/server";

import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { publicError, resolvePublicRequest } from "@/modules/public-intake/route-context";
import { getPublicIntakeStorage, PreviewUnavailableError } from "@/modules/public-intake/storage";

export const runtime = "nodejs";

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
    : (await getPublicIntakeRepository().listFiles(access.record.submissionId)).find(
        (candidate) => candidate.fileId === fileId && candidate.status === "UPLOADED",
      );
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
