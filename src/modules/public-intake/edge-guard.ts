import { timingSafeEqual } from "node:crypto";

/**
 * Chốt chặn "đi vòng qua Cloudflare" (PLAN_NL §10.2).
 *
 * URL `*.vercel.app` của mỗi deployment luôn gọi thẳng được, nên nếu origin không đòi header bí
 * mật do Cloudflare gắn vào thì WAF, rate limiting và Turnstile ở edge đều trở thành trang trí.
 */

export const ORIGIN_AUTH_HEADER = "x-origin-auth";

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Bắt buộc ở mọi môi trường đã triển khai — gồm cả Preview của Vercel, vốn có URL công khai và
 * cũng phải được bảo vệ (PLAN_NL §10.1). Dev local không có Cloudflare đứng trước nên không đòi.
 *
 * Đây là nhánh theo môi trường triển khai, cố ý **không** phải nhánh theo từng request: không có
 * đường nào để người gọi tự khai mình đáng tin.
 */
export function trustedEdgeRequired(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Nhận `request.headers` của route hoặc `headers()` của server component — cùng một hợp đồng. */
export interface HeaderSource {
  get(name: string): string | null;
}

export function isTrustedEdgeRequest(
  headers: HeaderSource,
  sharedSecret: string,
  enforced: boolean = trustedEdgeRequired(),
): boolean {
  if (!enforced) {
    return true;
  }

  const presented = headers.get(ORIGIN_AUTH_HEADER);
  if (!presented) {
    return false;
  }

  return safeEquals(presented, sharedSecret);
}
