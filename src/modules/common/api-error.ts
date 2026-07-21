export const API_ERROR_CODES = [
  "ACCESS_DENIED",
  "UNAUTHENTICATED",
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiErrorDetails = Readonly<Record<string, boolean | number | string | null>> | null;

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
