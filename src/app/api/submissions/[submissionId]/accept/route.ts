import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { UserRole } from "@/modules/common/domain";
import { loadServerEnvironment } from "@/modules/common/env";
import {
  getPublicIntakeRepository,
  SubmissionIdempotencyConflictError,
  SubmissionVersionConflictError,
} from "@/modules/public-intake/repository";
import { REFERENCE_IS_PLACEHOLDER } from "@/modules/public-intake/reference";
import {
  canStartOfficialAcceptance,
  OFFICIAL_ACCEPTANCE_CATALOG_MESSAGE,
} from "@/modules/submissions/acceptance";
import {
  AcceptanceInProgressError,
  AcceptanceNotAllowedError,
  AcceptanceRetryableError,
  runOfficialAcceptance,
} from "@/modules/submissions/acceptance-saga";
import { SUBMISSION_DECISION_ROLES } from "@/modules/submissions/review";

export const runtime = "nodejs";

const schema = z.object({ version: z.number().int().positive() });

function fail(
  code:
    | "ACCESS_DENIED"
    | "UNAUTHENTICATED"
    | "VALIDATION_FAILED"
    | "NOT_FOUND"
    | "VERSION_CONFLICT"
    | "IDEMPOTENCY_CONFLICT"
    | "ACCEPTANCE_IN_PROGRESS"
    | "SERVICE_UNAVAILABLE"
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
 * Điểm vào saga tiếp nhận chính thức (resumable).
 * Bị khóa an toàn khi danh mục trường 12 còn là dữ liệu demo.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const body = schema.safeParse(await request.json());
    const rawIdempotencyKey = request.headers.get("idempotency-key");
    if (!body.success || !rawIdempotencyKey || rawIdempotencyKey.length > 256) {
      return fail(
        "VALIDATION_FAILED",
        "Version hoặc idempotency key không hợp lệ.",
        requestId,
        400,
      );
    }
    const user = await requireActiveUser(SUBMISSION_DECISION_ROLES);
    if (
      !verifyCsrfToken(
        loadServerEnvironment().AUTH_SECRET,
        user.email,
        request.headers.get("x-csrf-token"),
      )
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ hoặc đã hết hạn.", requestId, 403);
    }
    const { submissionId } = await context.params;
    const repository = getPublicIntakeRepository();
    const record = await repository.findById(submissionId);
    if (!record) return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId, 404);

    const isAdministrator =
      user.roles.includes(UserRole.WARD_ADMIN) || user.roles.includes(UserRole.SYSTEM_ADMIN);

    if (
      record.status !== "ACCEPTING" &&
      !canStartOfficialAcceptance(record, user.email, isAdministrator)
    ) {
      return fail(
        "VALIDATION_FAILED",
        "Hồ sơ phải đang được bạn nhận xử lý, ở trạng thái đang xử lý và chưa có mã hồ sơ chính thức.",
        requestId,
        400,
      );
    }

    if (record.status !== "ACCEPTING" && record.version !== body.data.version) {
      return fail("VERSION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trang.", requestId, 409);
    }

    if (REFERENCE_IS_PLACEHOLDER) {
      await repository.appendAudit({
        actorEmail: user.email,
        action: "OFFICIAL_ACCEPTANCE_BLOCKED_REFERENCE_CATALOG",
        entityId: record.submissionId,
        requestId,
      });
      return fail("VALIDATION_FAILED", OFFICIAL_ACCEPTANCE_CATALOG_MESSAGE, requestId, 409);
    }

    const idempotencyKey = `OFFICIAL_ACCEPT:${submissionId}:${rawIdempotencyKey}`;
    const mutationHash = createHash("sha256")
      .update(
        JSON.stringify({
          submissionId,
          actorEmail: user.email,
          version: body.data.version,
        }),
      )
      .digest("hex");

    const result = await runOfficialAcceptance({
      record,
      expectedVersion: body.data.version,
      actorEmail: user.email,
      actorDisplayName: user.displayName,
      isAdministrator,
      requestId,
      idempotencyKey,
      mutationHash,
    });

    return NextResponse.json({
      submission: {
        officialCaseId: result.officialCaseId,
        status: result.status,
        version: result.version,
      },
      requestId,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return fail(
        error.kind,
        error.message,
        requestId,
        error.kind === "UNAUTHENTICATED" ? 401 : 403,
      );
    }
    if (error instanceof AcceptanceNotAllowedError) {
      return fail("VALIDATION_FAILED", error.message, requestId, 400);
    }
    if (error instanceof SubmissionVersionConflictError) {
      return fail("VERSION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trang.", requestId, 409);
    }
    if (error instanceof SubmissionIdempotencyConflictError) {
      return fail("IDEMPOTENCY_CONFLICT", "Yêu cầu tiếp nhận bị xung đột.", requestId, 409);
    }
    if (error instanceof AcceptanceInProgressError) {
      return fail("ACCEPTANCE_IN_PROGRESS", error.message, requestId, 409);
    }
    if (error instanceof AcceptanceRetryableError) {
      return fail("SERVICE_UNAVAILABLE", error.message, requestId, 503);
    }
    return fail("INTERNAL_ERROR", "Không thể bắt đầu tiếp nhận chính thức.", requestId, 500);
  }
}
