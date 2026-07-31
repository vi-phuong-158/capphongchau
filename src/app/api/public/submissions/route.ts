import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment, type PublicIntakeEnvironment } from "@/modules/common/env";
import {
  isValidPublicIdempotencyKey,
  publicRequestLogKey,
} from "@/modules/public-intake/creation-idempotency";
import {
  createIntakeSubmission,
  creationFingerprint,
  CreationConflictError,
  StaleChallengeError,
  type CreationResult,
} from "@/modules/public-intake/create-submission";
import { validateCreateSubmissionRequest } from "@/modules/public-intake/create-request";
import { isTrustedEdgeRequest } from "@/modules/public-intake/edge-guard";
import { publicError, publicPrivateJson } from "@/modules/public-intake/route-context";
import {
  createPublicCsrfToken,
  createSessionToken,
  PUBLIC_SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from "@/modules/public-intake/session";
import {
  TURNSTILE_HEADER,
  turnstileHostnames,
  verifyTurnstileToken,
} from "@/modules/public-intake/turnstile";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Chặn hai retry chồng nhau trong cùng instance; định danh HMAC vẫn là hàng rào liên-instance. */
const inFlightCreations = new Map<
  string,
  { readonly mutationHash: string; readonly operation: Promise<CreationResult> }
>();

/**
 * Tạo bản kê khai nháp. Không cần đăng nhập.
 *
 * TODO trước khi deploy công khai: bắt buộc xác minh Turnstile ở đây, ở `access` và ở `submit`;
 * đặt Cloudflare rate limiting trước `/api/public/*` (PLAN_NL §10, §10.2). Chạy cục bộ thì
 * chưa có lớp này.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();

  let environment: PublicIntakeEnvironment;
  try {
    environment = loadPublicIntakeEnvironment();
  } catch {
    return publicError("INTERNAL_ERROR", "Hệ thống chưa sẵn sàng nhận kê khai.", requestId);
  }

  if (environment.PUBLIC_INTAKE_MODE === "PAUSED") {
    return publicError(
      "SERVICE_UNAVAILABLE",
      "Hệ thống đang tạm dừng tiếp nhận hồ sơ mới.",
      requestId,
    );
  }

  if (!isTrustedEdgeRequest(request.headers, environment.ORIGIN_SHARED_SECRET)) {
    return publicError("ACCESS_DENIED", "Yêu cầu không hợp lệ.", requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  const validated = validateCreateSubmissionRequest(body);
  if (!validated.ok) {
    return publicError("VALIDATION_FAILED", validated.message, requestId);
  }
  const { phone, consentAccepted } = validated.value;

  const rawIdempotencyKey = request.headers.get("idempotency-key");
  if (!isValidPublicIdempotencyKey(rawIdempotencyKey)) {
    return publicError(
      "VALIDATION_FAILED",
      "Thiếu khóa chống gửi trùng. Tải lại trang và thử lại.",
      requestId,
    );
  }

  // Turnstile đứng trước mọi lệnh gọi Google: một bản kê khai rác không được phép tốn lượt ghi
  // Sheets hay một thư mục Drive nào. Token dùng một lần, nên lần retry trên mạng yếu gửi lại
  // đúng token cũ — trường hợp đó chỉ được đi tiếp vào đường replay, không được tạo bản mới.
  const turnstile = await verifyTurnstileToken({
    token: request.headers.get(TURNSTILE_HEADER),
    action: "create",
    secretKey: environment.TURNSTILE_SECRET_KEY,
    expectedHostnames: turnstileHostnames(environment.APP_BASE_URL),
  });
  if (!turnstile.ok && !turnstile.duplicate) {
    return publicError(
      "ACCESS_DENIED",
      "Chưa xác minh được thao tác này do người thật thực hiện. Tải lại trang và thử lại.",
      requestId,
    );
  }

  try {
    const idempotencyKey = publicRequestLogKey(rawIdempotencyKey);
    const mutationHash = creationFingerprint(
      environment.PUBLIC_ACCESS_CODE_PEPPER,
      phone,
      environment.CONSENT_NOTICE_VERSION,
    );
    let activeCreation = inFlightCreations.get(idempotencyKey);
    if (activeCreation && activeCreation.mutationHash !== mutationHash) {
      throw new CreationConflictError();
    }
    const ownsOperation = !activeCreation;
    if (!activeCreation) {
      const operation = createIntakeSubmission({
        rawIdempotencyKey,
        idempotencyKey,
        mutationHash,
        phone,
        requestId,
        sessionSecret: environment.PUBLIC_SESSION_SECRET,
        accessPepper: environment.PUBLIC_ACCESS_CODE_PEPPER,
        replayOnly: turnstile.duplicate,
        consentAccepted,
        consentVersion: environment.CONSENT_NOTICE_VERSION,
        // Cổng công khai LUÔN là tự kê khai. Không có đường nào để client tự khai là cán bộ.
        channel: "SELF_SERVICE",
      });
      activeCreation = { mutationHash, operation };
      inFlightCreations.set(idempotencyKey, activeCreation);
    }

    let result: CreationResult;
    try {
      result = await activeCreation.operation;
    } finally {
      if (ownsOperation && inFlightCreations.get(idempotencyKey) === activeCreation) {
        inFlightCreations.delete(idempotencyKey);
      }
    }

    return createSuccessResponse({
      submissionId: result.submissionId,
      receiptCode: result.receiptCode,
      accessSecret: result.accessSecret,
      sessionSecret: environment.PUBLIC_SESSION_SECRET,
      requestId,
      recovered: result.recovered,
    });
  } catch (error) {
    if (error instanceof CreationConflictError) {
      return publicError(
        "IDEMPOTENCY_CONFLICT",
        "Lần thử trước dùng số điện thoại khác. Kiểm tra lại số và thử lần nữa.",
        requestId,
      );
    }
    if (error instanceof StaleChallengeError) {
      return publicError(
        "ACCESS_DENIED",
        "Chưa xác minh được thao tác này do người thật thực hiện. Tải lại trang và thử lại.",
        requestId,
      );
    }
    // Google/biến môi trường có thể lỗi sau một phần thao tác. Không trả stack, Drive ID hay PII;
    // cùng idempotency key ở lần thử sau sẽ tiếp tục đúng bản nháp thay vì tạo bản mới.
    return publicError(
      "INTERNAL_ERROR",
      "Hệ thống chưa hoàn tất tạo bản kê khai. Vui lòng bấm Tiếp tục để thử lại.",
      requestId,
    );
  }
}

async function createSuccessResponse(input: {
  submissionId: string;
  receiptCode: string;
  accessSecret: string;
  sessionSecret: string;
  requestId: string;
  recovered: boolean;
}): Promise<NextResponse> {
  const cookieStore = await cookies();
  cookieStore.set(
    PUBLIC_SESSION_COOKIE,
    createSessionToken(input.sessionSecret, {
      submissionId: input.submissionId,
      rowIndex: 0,
      accessVersion: 1,
      issuedAt: Math.floor(Date.now() / 1000),
    }),
    {
      ...SESSION_COOKIE_OPTIONS,
      secure: process.env.NODE_ENV === "production",
    },
  );

  return publicPrivateJson({
    receiptCode: input.receiptCode,
    accessSecret: input.accessSecret,
    csrfToken: createPublicCsrfToken(input.sessionSecret, input.submissionId),
    requestId: input.requestId,
    recovered: input.recovered,
  });
}
