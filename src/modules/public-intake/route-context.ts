import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  createApiErrorPayload,
  type ApiErrorCode,
  type ApiErrorDetails,
} from "@/modules/common/api-error";
import { loadPublicIntakeEnvironment } from "@/modules/common/env";

import { isTrustedEdgeRequest } from "./edge-guard";
import { getPublicIntakeRepository, type SubmissionRecord } from "./repository";
import {
  createSessionToken,
  PUBLIC_CSRF_HEADER,
  PUBLIC_SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
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
  | "SIZE_BUDGET_EXCEEDED"
  | "SERVICE_UNAVAILABLE";

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
  SERVICE_UNAVAILABLE: 503,
};

export function publicPrivateJson<T>(payload: T, init: ResponseInit = {}): NextResponse<T> {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");
  return NextResponse.json(payload, { ...init, headers });
}

export function publicError(
  code: PublicErrorCode,
  message: string,
  requestId: string = randomUUID(),
  details?: ApiErrorDetails,
): NextResponse {
  return publicPrivateJson(
    createApiErrorPayload({ code: code as ApiErrorCode, message, requestId, details }),
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

  const record = await getPublicIntakeRepository().findByLocator(
    session.submissionId,
    session.rowIndex,
  );
  if (!record) {
    return publicError("NOT_FOUND", "Không tìm thấy bản kê khai.", requestId);
  }

  if (record.accessVersion !== session.accessVersion) {
    return publicError(
      "UNAUTHENTICATED",
      "Phiên truy cập không còn hiệu lực. Nhập mã tiếp nhận và mã bí mật mới để tiếp tục.",
      requestId,
    );
  }

  if (session.tokenVersion === "v1" || session.rowIndex !== record.rowIndex) {
    cookieStore.set(
      PUBLIC_SESSION_COOKIE,
      createSessionToken(environment.PUBLIC_SESSION_SECRET, {
        submissionId: record.submissionId,
        rowIndex: record.rowIndex,
        accessVersion: record.accessVersion,
        issuedAt: session.issuedAt,
      }),
      {
        ...SESSION_COOKIE_OPTIONS,
        secure: process.env.NODE_ENV === "production",
      },
    );
  }

  return { record, requestId };
}

/**
 * Có cán bộ đang cầm hồ sơ này hay không.
 *
 * `claimed_by` được giữ nguyên qua nhiều trạng thái (xem `commitStaffAction`: cột chỉ bị xóa khi
 * RELEASE hoặc khi người dân gửi lại), nên đây là câu trả lời đúng cho "hồ sơ có đang thuộc về ai
 * không", độc lập với trạng thái.
 */
export function isHeldByOfficer(record: SubmissionRecord): boolean {
  return record.claimedBy.trim().length > 0;
}

/**
 * Sau khi gửi, bản khai bị khóa; chỉ mở lại khi cán bộ yêu cầu bổ sung (PLAN_NL §4.2).
 *
 * **[2026-07-29] Đợt 2A-3 — cán bộ ưu tiên.** Thêm điều kiện "chưa có cán bộ nào cầm hồ sơ".
 * Trước đó, hồ sơ `NEEDS_SUPPLEMENT` vẫn giữ nguyên `claimed_by` của cán bộ đã yêu cầu bổ sung
 * (luồng cũ, đã bỏ ở 2A-1), mà `repository.submit()` lại **xóa sạch** `claimed_by`/`claimed_at`
 * khi người dân gửi lại. Nghĩa là một lần bấm "Bổ sung hồ sơ" của người dân âm thầm cướp hồ sơ
 * khỏi tay cán bộ đang xử lý, không có xung đột phiên bản nào để chặn (version vẫn khớp). Từ đây
 * người dân bị chặn ở TẤT CẢ đường ghi công khai — hàm này là chốt duy nhất cho cả bảy route
 * `/api/public/submissions/current/*` nên không route nào có thể quên.
 *
 * `DRAFT` không bao giờ bị ảnh hưởng: `mayClaim` không cho nhận hồ sơ nháp nên `claimed_by` luôn
 * rỗng ở trạng thái đó.
 */
export function isEditable(record: SubmissionRecord): boolean {
  if (isHeldByOfficer(record)) return false;
  return record.status === "DRAFT" || record.status === "NEEDS_SUPPLEMENT";
}
