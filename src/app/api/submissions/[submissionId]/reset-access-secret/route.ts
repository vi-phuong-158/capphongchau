import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { verifyCsrfToken } from "@/modules/auth/csrf";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { UserRole } from "@/modules/common/domain";
import { loadServerEnvironment } from "@/modules/common/env";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { deriveResetAccessSecret, hashAccessSecret } from "@/modules/public-intake/session";

export const runtime = "nodejs";

const ADMIN_ROLES = [UserRole.SYSTEM_ADMIN, UserRole.WARD_ADMIN] as const;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const user = await requireActiveUser(ADMIN_ROLES);
    const environment = loadServerEnvironment();
    if (
      !verifyCsrfToken(environment.AUTH_SECRET, user.email, request.headers.get("x-csrf-token"))
    ) {
      return fail("ACCESS_DENIED", "Yêu cầu bảo mật không hợp lệ.", requestId, 403);
    }
    const idempotencyKey = request.headers.get("idempotency-key");
    const body = (await request.json()) as { identityVerified?: unknown };
    if (!idempotencyKey || idempotencyKey.length > 256 || body.identityVerified !== true) {
      return fail(
        "VALIDATION_FAILED",
        "Chỉ đặt lại mã sau khi đã đối chiếu trực tiếp giấy tờ của người nộp.",
        requestId,
        400,
      );
    }
    const { submissionId } = await context.params;
    const repository = getPublicIntakeRepository();
    const scopedIdempotencyKey = `ACCESS_SECRET_RESET:${submissionId}:${idempotencyKey}`;
    const mutationHash = createHash("sha256")
      .update(JSON.stringify({ submissionId, actorEmail: user.email, identityVerified: true }))
      .digest("hex");
    const replay = await repository.findStoredMutation(scopedIdempotencyKey, "ACCESS_SECRET_RESET");
    if (replay) {
      if (replay.mutationHash !== mutationHash) {
        return fail(
          "IDEMPOTENCY_CONFLICT",
          "Khóa chống gửi trùng đã dùng cho thao tác khác.",
          requestId,
          409,
        );
      }
      const accessVersion = replay.response.accessVersion;
      if (typeof accessVersion !== "number") {
        return fail(
          "INTERNAL_ERROR",
          "Không thể khôi phục kết quả thao tác trước.",
          requestId,
          500,
        );
      }
      return NextResponse.json({
        accessSecret: deriveResetAccessSecret(
          environment.PUBLIC_ACCESS_CODE_PEPPER,
          scopedIdempotencyKey,
        ),
        accessVersion,
        requestId,
      });
    }
    const record = await repository.findById(submissionId);
    if (!record) return fail("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId, 404);
    const accessSecret = deriveResetAccessSecret(
      environment.PUBLIC_ACCESS_CODE_PEPPER,
      scopedIdempotencyKey,
    );
    const updated = await repository.commitAccessSecretReset({
      record,
      accessCodeHash: hashAccessSecret(environment.PUBLIC_ACCESS_CODE_PEPPER, accessSecret),
      actorEmail: user.email,
      requestId,
      idempotencyKey: scopedIdempotencyKey,
      mutationHash,
    });
    return NextResponse.json({ accessSecret, accessVersion: updated.accessVersion, requestId });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return fail(
        error.kind,
        error.message,
        requestId,
        error.kind === "UNAUTHENTICATED" ? 401 : 403,
      );
    }
    return fail("INTERNAL_ERROR", "Không thể đặt lại mã bí mật.", requestId, 500);
  }
}

function fail(
  code:
    | "ACCESS_DENIED"
    | "UNAUTHENTICATED"
    | "VALIDATION_FAILED"
    | "NOT_FOUND"
    | "IDEMPOTENCY_CONFLICT"
    | "INTERNAL_ERROR",
  message: string,
  requestId: string,
  status: number,
): NextResponse {
  return NextResponse.json(createApiErrorPayload({ code, message, requestId }), { status });
}
