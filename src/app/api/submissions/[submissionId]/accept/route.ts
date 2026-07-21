import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { UserRole } from "@/modules/common/domain";
import { loadServerEnvironment } from "@/modules/common/env";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { REFERENCE_IS_PLACEHOLDER } from "@/modules/public-intake/reference";
import {
  canStartOfficialAcceptance,
  OFFICIAL_ACCEPTANCE_CATALOG_MESSAGE,
} from "@/modules/submissions/acceptance";
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
 * Điểm vào saga tiếp nhận chính thức. Hiện bị khóa có chủ đích khi danh mục
 * trường 12 còn là dữ liệu demo: không được sinh CASE/di chuyển file nửa chừng.
 */
export async function POST(
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
    if (record.version !== body.data.version) {
      return fail("VERSION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trang.", requestId, 409);
    }
    const isAdministrator =
      user.roles.includes(UserRole.WARD_ADMIN) || user.roles.includes(UserRole.SYSTEM_ADMIN);
    if (!canStartOfficialAcceptance(record, user.email, isAdministrator)) {
      return fail(
        "VALIDATION_FAILED",
        "Hồ sơ phải đang được bạn nhận xử lý, ở trạng thái đang xử lý và chưa có mã hồ sơ chính thức.",
        requestId,
        400,
      );
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

    // The resumable saga is deliberately not enabled until the official reference
    // catalogue and canonical CASE/PARCEL schema migration are both approved.
    // Keeping this hard stop prevents a partially promoted legal record.
    return fail(
      "VALIDATION_FAILED",
      "Saga tiếp nhận chưa được mở cho dữ liệu thật.",
      requestId,
      409,
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
    return fail("INTERNAL_ERROR", "Không thể bắt đầu tiếp nhận chính thức.", requestId, 500);
  }
}
