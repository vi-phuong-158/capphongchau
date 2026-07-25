import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { loadServerEnvironment } from "@/modules/common/env";
import {
  getPublicIntakeRepository,
  SubmissionVersionConflictError,
} from "@/modules/public-intake/repository";
import type { IntakeDraft } from "@/modules/public-intake/types";
import { draftSchema } from "@/modules/public-intake/validation";
import { SUBMISSION_READ_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";

const schema = z.object({
  expectedVersion: z.number().int().positive(),
  payload: draftSchema,
  changeNote: z.string().trim().max(500).optional(),
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
) {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const user = await requireActiveUser(SUBMISSION_READ_ROLES);
    const environment = loadServerEnvironment();
    if (
      !verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", requestId, 403);
    }

    const idempotencyKey = request.headers.get("idempotency-key");
    const body = schema.safeParse(await request.json());
    if (!body.success || !idempotencyKey || idempotencyKey.length > 256) {
      return fail(
        "VALIDATION_FAILED",
        "Dữ liệu biên tập hoặc idempotency key không hợp lệ.",
        requestId,
        400,
      );
    }

    const { submissionId } = await context.params;
    const repository = getPublicIntakeRepository();
    const scopedIdempotencyKey = `WORKING_PAYLOAD_EDIT:${submissionId}:${idempotencyKey}`;
    const mutationHash = createHash("sha256")
      .update(
        JSON.stringify({
          submissionId,
          actorEmail: user.email,
          expectedVersion: body.data.expectedVersion,
          payload: body.data.payload,
          changeNote: body.data.changeNote ?? "",
        }),
      )
      .digest("hex");

    const replay = await repository.findStoredMutation(
      scopedIdempotencyKey,
      "WORKING_PAYLOAD_EDIT",
    );
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

    if (record.claimedBy !== user.email || record.status !== "UNDER_REVIEW") {
      return fail(
        "ACCESS_DENIED",
        "Hồ sơ phải đang do bạn nhận xử lý và ở trạng thái đang xử lý mới biên tập được.",
        requestId,
        403,
      );
    }

    const updated = await repository.commitWorkingPayload({
      record,
      expectedVersion: body.data.expectedVersion,
      draft: body.data.payload as unknown as IntakeDraft,
      actorEmail: user.email,
      changeNote: body.data.changeNote,
      requestId,
      idempotencyKey: scopedIdempotencyKey,
      mutationHash,
    });

    return NextResponse.json(
      { submission: { version: updated.version, updatedAt: updated.updatedAt }, requestId },
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
    return fail("INTERNAL_ERROR", "Không thể cập nhật bản làm việc.", requestId, 500);
  }
}
