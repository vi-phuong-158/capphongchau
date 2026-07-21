import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createApiErrorPayload, type ApiErrorCode } from "@/modules/common/api-error";
import { loadPublicIntakeEnvironment } from "@/modules/common/env";

import { isTrustedEdgeRequest } from "./edge-guard";
import { getPublicIntakeRepository, type SubmissionRecord } from "./repository";
import {
  PUBLIC_CSRF_HEADER,
  PUBLIC_SESSION_COOKIE,
  verifyPublicCsrfToken,
  verifySessionToken,
} from "./session";

/** Mã lỗi riêng của cổng công khai, bổ sung cho `API_ERROR_CODES` dùng chung. */
export type PublicErrorCode =
  | ApiErrorCode
  | "RATE_LIMITED"
  | "INVALID_ACCESS_CODE"
  | "SUBMISSION_LOCKED"
  | "INVALID_STATE"
  | "UPLOAD_INCOMPLETE"
  | "SIZE_BUDGET_EXCEEDED";

const PUBLIC_ERROR_STATUS: Readonly<Record<string, number>> = {
  ACCESS_DENIED: 403,
  UNAUTHENTICATED: 401,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INTERNAL_ERROR: 500,
  RATE_LIMITED: 429,
  INVALID_ACCESS_CODE: 401,
  SUBMISSION_LOCKED: 423,
  INVALID_STATE: 409,
  UPLOAD_INCOMPLETE: 409,
  SIZE_BUDGET_EXCEEDED: 413,
};

export function publicError(
  code: PublicErrorCode,
  message: string,
  requestId: string = randomUUID(),
): NextResponse {
  return NextResponse.json(
    createApiErrorPayload({ code: code as ApiErrorCode, message, requestId }),
    { status: PUBLIC_ERROR_STATUS[code] ?? 500 },
  );
}

export interface PublicRequestContext {
  readonly record: SubmissionRecord;
  readonly requestId: string;
}

/**
 * Giải phiên từ cookie và kiểm CSRF cho mọi thao tác ghi. Bản kê khai được xác định hoàn toàn
 * từ cookie đã ký — không bao giờ nhận `submission_id` từ URL hay body, để không ai đọc được
 * hồ sơ của người khác bằng cách đoán ID.
 *
 * Cũng là chốt chặn lớp biên cho toàn bộ `/api/public/submissions/current/*`: route mới chỉ cần
 * đi qua đây là đã được bảo vệ.
 */
export async function resolvePublicRequest(
  request: Request,
  options: { requireCsrf: boolean },
): Promise<PublicRequestContext | NextResponse> {
  const requestId = randomUUID();
  const environment = loadPublicIntakeEnvironment();

  if (!isTrustedEdgeRequest(request.headers, environment.ORIGIN_SHARED_SECRET)) {
    return publicError("ACCESS_DENIED", "Yêu cầu không hợp lệ.", requestId);
  }

  const cookieStore = await cookies();
  const session = verifySessionToken(
    environment.PUBLIC_SESSION_SECRET,
    cookieStore.get(PUBLIC_SESSION_COOKIE)?.value,
  );

  if (!session) {
    return publicError(
      "UNAUTHENTICATED",
      "Phiên kê khai đã hết hạn. Nhập lại mã tiếp nhận và mã bí mật để tiếp tục.",
      requestId,
    );
  }

  if (options.requireCsrf) {
    const token = request.headers.get(PUBLIC_CSRF_HEADER);
    if (!verifyPublicCsrfToken(environment.PUBLIC_SESSION_SECRET, session.submissionId, token)) {
      return publicError(
        "ACCESS_DENIED",
        "Yêu cầu không hợp lệ. Tải lại trang và thử lại.",
        requestId,
      );
    }
  }

  const record = await getPublicIntakeRepository().findById(session.submissionId);
  if (!record) {
    return publicError("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId);
  }

  return { record, requestId };
}

/** Sau khi gửi, bản khai bị khóa; chỉ mở lại khi cán bộ yêu cầu bổ sung (PLAN_NL §4.2). */
export function isEditable(record: SubmissionRecord): boolean {
  return record.status === "DRAFT" || record.status === "NEEDS_SUPPLEMENT";
}
