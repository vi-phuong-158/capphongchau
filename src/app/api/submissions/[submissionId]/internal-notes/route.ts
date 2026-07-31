import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { loadServerEnvironment } from "@/modules/common/env";
import {
  getPublicIntakeRepository,
  SubmissionIdempotencyConflictError,
  SubmissionVersionConflictError,
} from "@/modules/public-intake/repository";
import { SUBMISSION_DECISION_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  expectedVersion: z.number().int().positive(),
  internalNotes: z.string().trim().max(4000),
});

function fail(
  code:
    | "ACCESS_DENIED"
    | "UNAUTHENTICATED"
    | "VALIDATION_FAILED"
    | "NOT_FOUND"
    | "VERSION_CONFLICT"
    | "IDEMPOTENCY_CONFLICT"
    | "INTERNAL_ERROR",
  message: string,
  requestId: string,
  status: number,
): NextResponse {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Ghi chú nội bộ (Đợt 2A-2) — một ô tự do cho cán bộ, tách hẳn khỏi `PATCH /:submissionId` vì
 * không thuộc `draft_json`/PL3 và không phụ thuộc trạng thái hồ sơ hay ai đang nhận xử lý. Bất kỳ
 * cán bộ nào có quyền quyết định hồ sơ đều sửa được, ở bất kỳ trạng thái nào.
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const body = schema.safeParse(await request.json());
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!body.success || !idempotencyKey || idempotencyKey.length > 256) {
      return fail(
        "VALIDATION_FAILED",
        "Dữ liệu ghi chú hoặc idempotency key không hợp lệ.",
        requestId,
        400,
      );
    }
    const user = await requireActiveUser(SUBMISSION_DECISION_ROLES);
    const environment = loadServerEnvironment();
    if (
      !verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", requestId, 403);
    }

    const { submissionId } = await context.params;
    const repository = getPublicIntakeRepository();
    const scopedIdempotencyKey = `INTERNAL_NOTES_EDIT:${submissionId}:${idempotencyKey}`;
    const mutationHash = createHash("sha256")
      .update(
        JSON.stringify({
          submissionId,
          actorEmail: user.email,
          expectedVersion: body.data.expectedVersion,
          internalNotes: body.data.internalNotes,
        }),
      )
      .digest("hex");

    const replay = await repository.findStoredMutation(scopedIdempotencyKey, "INTERNAL_NOTES_EDIT");
    if (replay) {
      if (replay.mutationHash !== mutationHash) {
        return fail(
          "IDEMPOTENCY_CONFLICT",
          "Khóa chống gửi trùng đã dùng cho thao tác khác.",
          requestId,
          409,
        );
      }
      const version = replay.response.version;
      if (typeof version !== "number") {
        return fail(
          "INTERNAL_ERROR",
          "Không thể khôi phục kết quả thao tác trước.",
          requestId,
          500,
        );
      }
      return NextResponse.json(
        { submission: { version }, requestId },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const record = await repository.findById(submissionId);
    if (!record) return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId, 404);
    if (record.version !== body.data.expectedVersion) {
      return fail("VERSION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trang.", requestId, 409);
    }

    const updated = await repository.commitInternalNotes({
      record,
      expectedVersion: body.data.expectedVersion,
      internalNotes: body.data.internalNotes,
      actorEmail: user.email,
      requestId,
      idempotencyKey: scopedIdempotencyKey,
      mutationHash,
    });

    return NextResponse.json(
      { submission: { version: updated.version }, requestId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return fail(
        error.kind,
        error.message,
        requestId,
        error.kind === "UNAUTHENTICATED" ? 401 : 403,
      );
    }
    if (error instanceof SubmissionVersionConflictError) {
      return fail("VERSION_CONFLICT", error.message, requestId, 409);
    }
    if (error instanceof SubmissionIdempotencyConflictError) {
      return fail("IDEMPOTENCY_CONFLICT", error.message, requestId, 409);
    }
    return fail("INTERNAL_ERROR", "Không thể lưu ghi chú nội bộ.", requestId, 500);
  }
}
