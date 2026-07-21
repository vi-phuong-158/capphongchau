import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Phiên của người dân trên cổng công khai.
 *
 * Không dùng chung cơ chế với phiên cán bộ: người dân không có email nên `csrf.ts` của
 * `modules/auth` (ký theo email) không áp dụng được. Cookie chỉ chứa `submission_id` đã ký,
 * không chứa PII và không bao giờ chứa mã bí mật.
 *
 * Thời hạn: trượt 2 giờ, trần tuyệt đối 12 giờ (PLAN_NL §4.3) — biểu mẫu dài kèm upload ảnh
 * trên mạng yếu không thể xong trong 2 giờ cứng.
 */

export const PUBLIC_SESSION_COOKIE = "pc_kk_session";
export const PUBLIC_CSRF_HEADER = "x-public-csrf-token";

const SESSION_VERSION = "v1";
const SLIDING_SECONDS = 2 * 60 * 60;
const ABSOLUTE_SECONDS = 12 * 60 * 60;

export interface PublicSession {
  readonly submissionId: string;
  /** Thời điểm tạo phiên gốc, dùng cho trần tuyệt đối. */
  readonly issuedAt: number;
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSessionToken(
  secret: string,
  session: PublicSession,
  now = new Date(),
): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + SLIDING_SECONDS;
  const payload = `${SESSION_VERSION}.${session.submissionId}.${session.issuedAt}.${expiresAt}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifySessionToken(
  secret: string,
  token: string | undefined,
  now = new Date(),
): PublicSession | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 5) {
    return null;
  }

  const [version, submissionId, issuedAtRaw, expiresAtRaw, signature] = parts;
  if (version !== SESSION_VERSION || !/^\d+$/.test(issuedAtRaw) || !/^\d+$/.test(expiresAtRaw)) {
    return null;
  }

  const payload = `${version}.${submissionId}.${issuedAtRaw}.${expiresAtRaw}`;
  if (!safeEquals(signature, sign(secret, payload))) {
    return null;
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  const issuedAt = Number(issuedAtRaw);
  if (Number(expiresAtRaw) < nowSeconds || issuedAt + ABSOLUTE_SECONDS < nowSeconds) {
    return null;
  }

  return { submissionId, issuedAt };
}

/** CSRF buộc vào phiên công khai thay vì email như đường cán bộ. */
export function createPublicCsrfToken(
  secret: string,
  submissionId: string,
  now = new Date(),
): string {
  const expiresAt = String(Math.floor(now.getTime() / 1000) + SLIDING_SECONDS);
  const payload = `csrf.${submissionId}.${expiresAt}`;
  return `${expiresAt}.${sign(secret, payload)}`;
}

export function verifyPublicCsrfToken(
  secret: string,
  submissionId: string,
  token: string | null,
  now = new Date(),
): boolean {
  if (!token) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [expiresAt, signature] = parts;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Math.floor(now.getTime() / 1000)) {
    return false;
  }

  return safeEquals(signature, sign(secret, `csrf.${submissionId}.${expiresAt}`));
}

/** Chỉ lưu HMAC của mã bí mật; 80 bit ngẫu nhiên nên không cần KDF chậm (PLAN_NL §5.4). */
export function hashAccessSecret(pepper: string, secret: string): string {
  return createHmac("sha256", pepper).update(secret.replace(/-/g, "").toUpperCase()).digest("hex");
}

export function accessSecretMatches(pepper: string, secret: string, storedHash: string): boolean {
  return safeEquals(hashAccessSecret(pepper, secret), storedHash);
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "strict",
  path: "/",
  maxAge: SLIDING_SECONDS,
} as const;
