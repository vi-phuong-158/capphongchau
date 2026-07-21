import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { loadPublicIntakeEnvironment, type PublicIntakeEnvironment } from "@/modules/common/env";
import {
  deriveAccessSecret,
  derivePhoneFingerprint,
  deriveReceiptCode,
  deriveSubmissionId,
  isValidPublicIdempotencyKey,
  publicRequestLogKey,
} from "@/modules/public-intake/creation-idempotency";
import { isTrustedEdgeRequest } from "@/modules/public-intake/edge-guard";
import { getPublicIntakeRepository } from "@/modules/public-intake/repository";
import { publicError } from "@/modules/public-intake/route-context";
import {
  createPublicCsrfToken,
  createSessionToken,
  hashAccessSecret,
  PUBLIC_SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from "@/modules/public-intake/session";
import { getPublicIntakeStorage } from "@/modules/public-intake/storage";
import {
  TURNSTILE_HEADER,
  turnstileHostname,
  verifyTurnstileToken,
} from "@/modules/public-intake/turnstile";
import { emptyDraft } from "@/modules/public-intake/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Phiên bản thông báo bảo vệ dữ liệu mà người dân đã đồng ý — chờ văn bản chính thức. */
const CONSENT_VERSION = "draft-2026-07";

interface CreationResult {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly accessSecret: string;
  readonly recovered: boolean;
}

/** Chặn hai retry chồng nhau trong cùng instance; định danh HMAC vẫn là hàng rào liên-instance. */
const inFlightCreations = new Map<
  string,
  { readonly mutationHash: string; readonly operation: Promise<CreationResult> }
>();

class CreationConflictError extends Error {
  constructor() {
    super("Idempotency key đã được dùng với số điện thoại khác.");
    this.name = "CreationConflictError";
  }
}

/** Token Turnstile đã dùng nhưng không có bản nháp cũ để trả lại — không được tạo bản mới. */
class StaleChallengeError extends Error {
  constructor() {
    super("Mã xác minh đã được sử dụng.");
    this.name = "StaleChallengeError";
  }
}

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

  if (!isTrustedEdgeRequest(request.headers, environment.ORIGIN_SHARED_SECRET)) {
    return publicError("ACCESS_DENIED", "Yêu cầu không hợp lệ.", requestId);
  }

  let body: { phone?: unknown };
  try {
    body = (await request.json()) as { phone?: unknown };
  } catch {
    return publicError("VALIDATION_FAILED", "Nội dung yêu cầu không hợp lệ.", requestId);
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!/^0\d{9}$/.test(phone)) {
    return publicError(
      "VALIDATION_FAILED",
      "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.",
      requestId,
    );
  }

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
    expectedHostname: turnstileHostname(environment.APP_BASE_URL),
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
    const mutationHash = derivePhoneFingerprint(environment.PUBLIC_ACCESS_CODE_PEPPER, phone);
    let activeCreation = inFlightCreations.get(idempotencyKey);
    if (activeCreation && activeCreation.mutationHash !== mutationHash) {
      throw new CreationConflictError();
    }
    const ownsOperation = !activeCreation;
    if (!activeCreation) {
      const operation = createOrRecoverSubmission({
        rawIdempotencyKey,
        idempotencyKey,
        mutationHash,
        phone,
        requestId,
        sessionSecret: environment.PUBLIC_SESSION_SECRET,
        accessPepper: environment.PUBLIC_ACCESS_CODE_PEPPER,
        replayOnly: turnstile.duplicate,
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

async function createOrRecoverSubmission(input: {
  rawIdempotencyKey: string;
  idempotencyKey: string;
  mutationHash: string;
  phone: string;
  requestId: string;
  sessionSecret: string;
  accessPepper: string;
  replayOnly: boolean;
}): Promise<CreationResult> {
  const repository = getPublicIntakeRepository();
  const accessSecret = deriveAccessSecret(input.accessPepper, input.rawIdempotencyKey);
  const previous = await repository.findCreationByIdempotencyKey(input.idempotencyKey);

  if (previous) {
    if (previous.mutationHash !== input.mutationHash) {
      throw new CreationConflictError();
    }
    return {
      submissionId: previous.submissionId,
      receiptCode: previous.receiptCode,
      accessSecret,
      recovered: true,
    };
  }

  if (input.replayOnly) {
    throw new StaleChallengeError();
  }

  const submissionId = deriveSubmissionId(input.sessionSecret, input.rawIdempotencyKey);
  const receiptCode = deriveReceiptCode(input.sessionSecret, input.rawIdempotencyKey);
  const driveFolderId = await getPublicIntakeStorage().createSubmissionFolder(submissionId);
  const draft = emptyDraft(randomUUID(), randomUUID(), randomUUID());
  draft.phone = input.phone;
  draft.consentAccepted = true;

  await repository.create({
    submissionId,
    receiptCode,
    accessCodeHash: hashAccessSecret(input.accessPepper, accessSecret),
    idempotencyKey: input.idempotencyKey,
    mutationHash: input.mutationHash,
    requestId: input.requestId,
    phone: input.phone,
    driveFolderId,
    draft,
    consentVersion: CONSENT_VERSION,
  });

  return { submissionId, receiptCode, accessSecret, recovered: false };
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
      issuedAt: Math.floor(Date.now() / 1000),
    }),
    {
      ...SESSION_COOKIE_OPTIONS,
      secure: process.env.NODE_ENV === "production",
    },
  );

  return NextResponse.json({
    receiptCode: input.receiptCode,
    accessSecret: input.accessSecret,
    csrfToken: createPublicCsrfToken(input.sessionSecret, input.submissionId),
    requestId: input.requestId,
    recovered: input.recovered,
  });
}
