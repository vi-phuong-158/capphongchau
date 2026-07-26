import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { applyClearAiFields } from "@/modules/ai-extraction/draft";
import { getAiExtractionRepository } from "@/modules/ai-extraction/repository";
import { loadServerEnvironment } from "@/modules/common/env";
import {
  getPublicIntakeRepository,
  SubmissionIdempotencyConflictError,
  SubmissionVersionConflictError,
} from "@/modules/public-intake/repository";
import { SUBMISSION_DECISION_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    resultId: z.string().trim().min(1).max(100),
  })
  .strict();

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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const user = await requireActiveUser(SUBMISSION_DECISION_ROLES);
    const environment = loadServerEnvironment();
    if (
      !verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", requestId, 403);
    }
    const idempotencyKey = request.headers.get("idempotency-key");
    const body = bodySchema.safeParse(await request.json());
    if (!body.success || !idempotencyKey || idempotencyKey.length > 256) {
      return fail(
        "VALIDATION_FAILED",
        "Dữ liệu nạp nháp AI hoặc khóa chống gửi trùng không hợp lệ.",
        requestId,
        400,
      );
    }
    const { submissionId } = await context.params;
    const repository = getPublicIntakeRepository();
    const scopedKey = `AI_DRAFT_APPLY:${submissionId}:${idempotencyKey}`;
    const replay = await repository.findStoredMutation(scopedKey, "WORKING_PAYLOAD_EDIT");
    if (replay) {
      if (
        replay.response.aiResultId !== body.data.resultId ||
        replay.response.expectedVersion !== body.data.expectedVersion
      ) {
        return fail(
          "IDEMPOTENCY_CONFLICT",
          "Khóa chống gửi trùng đã dùng cho thao tác khác.",
          requestId,
          409,
        );
      }
      const version = replay.response.version;
      if (typeof version === "number") {
        const appliedFieldPaths = replay.response.appliedFieldPaths;
        return NextResponse.json(
          {
            submission: {
              version,
              updatedAt:
                typeof replay.response.updatedAt === "string" ? replay.response.updatedAt : "",
            },
            appliedFieldPaths: Array.isArray(appliedFieldPaths) ? appliedFieldPaths : [],
            requestId:
              typeof replay.response.requestId === "string" ? replay.response.requestId : requestId,
          },
          { headers: { "cache-control": "no-store" } },
        );
      }
    }
    const record = await repository.findById(submissionId);
    if (!record || !record.draft)
      return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId, 404);
    if (record.version !== body.data.expectedVersion) {
      return fail("VERSION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trang.", requestId, 409);
    }
    if (record.claimedBy !== user.email || record.status !== "UNDER_REVIEW") {
      return fail(
        "ACCESS_DENIED",
        "Chỉ cán bộ đang nhận xử lý mới nạp được bản nháp AI.",
        requestId,
        403,
      );
    }
    const resolved = await getAiExtractionRepository().getCurrentComparisons(
      submissionId,
      record.draft,
    );
    if (!resolved || resolved.draft.resultId !== body.data.resultId) {
      return fail(
        "VALIDATION_FAILED",
        "Kết quả AI không còn hiện hành hoặc đã bị thay thế.",
        requestId,
        400,
      );
    }
    if (resolved.draft.validationStatus === "BLOCKED") {
      return fail(
        "VALIDATION_FAILED",
        "Kết quả AI bị chặn, không thể nạp vào hồ sơ.",
        requestId,
        400,
      );
    }
    const applied = applyClearAiFields(record.draft, resolved.comparisons);
    if (applied.appliedFieldPaths.length === 0) {
      return fail(
        "VALIDATION_FAILED",
        "Không có trường CLEAR đang trống để nạp từ AI.",
        requestId,
        400,
      );
    }
    const mutationHash = createHash("sha256")
      .update(
        JSON.stringify({
          submissionId,
          actorEmail: user.email,
          expectedVersion: body.data.expectedVersion,
          resultId: body.data.resultId,
          fields: applied.appliedFieldPaths,
        }),
      )
      .digest("hex");
    const updated = await repository.commitWorkingPayload({
      record,
      expectedVersion: body.data.expectedVersion,
      draft: applied.draft,
      actorEmail: user.email,
      changeNote: "Nạp các trường CLEAR từ bản nháp AI.",
      requestId,
      idempotencyKey: scopedKey,
      mutationHash,
      aiApplication: {
        resultId: resolved.draft.resultId,
        jobId: resolved.draft.jobId,
        appliedFieldPaths: applied.appliedFieldPaths,
      },
    });
    return NextResponse.json(
      {
        submission: { version: updated.version, updatedAt: updated.updatedAt },
        appliedFieldPaths: applied.appliedFieldPaths,
        requestId,
      },
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
    if (error instanceof SubmissionVersionConflictError)
      return fail("VERSION_CONFLICT", error.message, requestId, 409);
    if (error instanceof SubmissionIdempotencyConflictError)
      return fail("IDEMPOTENCY_CONFLICT", error.message, requestId, 409);
    return fail("INTERNAL_ERROR", "Không thể nạp bản nháp AI.", requestId, 500);
  }
}
