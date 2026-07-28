export const API_ERROR_CODES = [
  "ACCESS_DENIED",
  "UNAUTHENTICATED",
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "ALREADY_CLAIMED",
  "ACCEPTANCE_IN_PROGRESS",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * Giá trị được phép nằm trong `details`. Cho phép mảng đối tượng phẳng để trả danh sách lỗi theo
 * trường (`details.issues`) — client cần `fieldPath` để focus đúng ô sai, một chuỗi thông báo
 * chung không làm được việc đó.
 *
 * Vẫn là allowlist: chỉ thông tin kỹ thuật an toàn, không PII, không token, không Drive ID/link.
 */
export type ApiErrorDetailScalar = boolean | number | string | null;
export type ApiErrorDetailValue =
  | ApiErrorDetailScalar
  | readonly ApiErrorDetailScalar[]
  | readonly Readonly<Record<string, ApiErrorDetailScalar>>[];
export type ApiErrorDetails = Readonly<Record<string, ApiErrorDetailValue>> | null;

export interface ApiErrorPayload {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly requestId: string;
    readonly details: ApiErrorDetails;
  };
}

export interface ApiErrorOptions {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly requestId: string;
  /** Chỉ truyền thông tin kỹ thuật an toàn; không chứa PII, token hay Drive ID/link. */
  readonly details?: ApiErrorDetails;
}

export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  ACCESS_DENIED: 403,
  UNAUTHENTICATED: 401,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  ALREADY_CLAIMED: 409,
  ACCEPTANCE_IN_PROGRESS: 409,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export function createApiErrorPayload(options: ApiErrorOptions): ApiErrorPayload {
  return {
    error: {
      code: options.code,
      message: options.message,
      requestId: options.requestId,
      details: options.details ?? null,
    },
  };
}
