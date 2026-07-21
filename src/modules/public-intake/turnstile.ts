/**
 * Xác minh Cloudflare Turnstile phía server (PLAN_NL §10).
 *
 * Fail-closed tuyệt đối: siteverify lỗi mạng, timeout hay trả `success:false` đều là từ chối.
 * Không có nhánh "gọi không được thì cho qua" — nhánh đó biến cả lớp chống lạm dụng thành tùy chọn
 * của kẻ tấn công, vì chỉ cần làm nghẽn siteverify là mở toang cổng.
 *
 * Token không bao giờ được ghi log: nó là bí mật dùng một lần của phiên người dân.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5_000;

export const TURNSTILE_HEADER = "x-turnstile-token";

export type TurnstileAction = "create" | "submit";

export interface TurnstileResult {
  readonly ok: boolean;
  /**
   * Token đã được dùng (`timeout-or-duplicate`). Không đủ để cho qua, nhưng phân biệt được với
   * token giả: lần thử lại trên mạng yếu gửi đúng token cũ, và luồng tạo nháp cần biết để cho
   * request đó đi tiếp vào đường replay idempotency thay vì tạo bản kê khai thứ hai.
   */
  readonly duplicate: boolean;
}

const REJECTED: TurnstileResult = { ok: false, duplicate: false };

interface SiteverifyResponse {
  readonly success?: boolean;
  readonly action?: string;
  readonly hostname?: string;
  readonly "error-codes"?: readonly string[];
}

export async function verifyTurnstileToken(input: {
  token: string | null | undefined;
  action: TurnstileAction;
  secretKey: string;
  /** Hostname mong đợi, lấy từ `APP_BASE_URL` — chặn token giải trên site khác đem sang dùng. */
  expectedHostname: string;
}): Promise<TurnstileResult> {
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!token || token.length > 2048) {
    return REJECTED;
  }

  let payload: SiteverifyResponse;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: input.secretKey, response: token }).toString(),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      return REJECTED;
    }
    payload = (await response.json()) as SiteverifyResponse;
  } catch {
    return REJECTED;
  }

  if (payload.success !== true) {
    return {
      ok: false,
      duplicate: (payload["error-codes"] ?? []).includes("timeout-or-duplicate"),
    };
  }

  // `success` chưa đủ: token phải được sinh cho đúng hành động và đúng site này.
  if (payload.action !== input.action || payload.hostname !== input.expectedHostname) {
    return REJECTED;
  }

  return { ok: true, duplicate: false };
}

export function turnstileHostname(appBaseUrl: string): string {
  return new URL(appBaseUrl).hostname;
}
