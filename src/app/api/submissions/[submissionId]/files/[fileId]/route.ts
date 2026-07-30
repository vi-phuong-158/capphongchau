import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { getPublicIntakeStorage, PreviewUnavailableError } from "@/modules/public-intake/storage";
import { SUBMISSION_READ_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _: NextRequest,
  context: { params: Promise<{ submissionId: string; fileId: string }> },
): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const user = await requireActiveUser(SUBMISSION_READ_ROLES);
    const { submissionId, fileId } = await context.params;
    const repository = getPublicIntakeRepository();
    const record = await repository.findById(submissionId);
    if (!record) {
      return NextResponse.json(
        createApiErrorPayload({
          code: "NOT_FOUND",
          message: "Không tìm thấy bản kê khai.",
          requestId,
        }),
        { status: 404 },
      );
    }
    const file = await repository.findActiveFile(submissionId, fileId);
    if (!file) {
      return NextResponse.json(
        createApiErrorPayload({
          code: "NOT_FOUND",
          message: "Không tìm thấy tệp hồ sơ.",
          requestId,
        }),
        { status: 404 },
      );
    }
    const preview = await getPublicIntakeStorage().readPreview(file.driveFileId);
    await repository.appendAudit({
      actorEmail: user.email,
      action: "SUBMISSION_FILE_PREVIEW_VIEWED",
      entityId: record.submissionId,
      requestId,
      metadata: { documentType: file.documentType },
    });
    return new NextResponse(new Uint8Array(preview.bytes).buffer, {
      headers: {
        "cache-control": "private, no-store",
        "content-type": preview.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        createApiErrorPayload({ code: error.kind, message: error.message, requestId }),
        { status: error.kind === "UNAUTHENTICATED" ? 401 : 403 },
      );
    }
    if (error instanceof PreviewUnavailableError) {
      return NextResponse.json(
        createApiErrorPayload({ code: "VALIDATION_FAILED", message: error.message, requestId }),
        { status: 422, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      createApiErrorPayload({
        code: "INTERNAL_ERROR",
        message: "Không thể tải ảnh xem trước.",
        requestId,
      }),
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
