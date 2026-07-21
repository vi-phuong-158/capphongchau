import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const CSRF_VERSION = "v1";
const CSRF_TTL_SECONDS = 10 * 60;

function signature(secret: string, email: string, expiresAt: string, nonce: string): string {
  return createHmac("sha256", secret).update(`${email}:${expiresAt}:${nonce}`).digest("base64url");
}

export function createCsrfToken(secret: string, email: string, now = new Date()): string {
  const expiresAt = String(Math.floor(now.getTime() / 1000) + CSRF_TTL_SECONDS);
  const nonce = randomUUID();
  const signed = signature(secret, email, expiresAt, nonce);
  return `${CSRF_VERSION}.${expiresAt}.${nonce}.${signed}`;
}

export function verifyCsrfToken(
  secret: string,
  email: string,
  token: string | null,
  now = new Date(),
): boolean {
  if (!token) {
    return false;
  }

  const [version, expiresAt, nonce, signed, ...rest] = token.split(".");
  if (
    version !== CSRF_VERSION ||
    !expiresAt ||
    !nonce ||
    !signed ||
    rest.length > 0 ||
    !/^\d+$/.test(expiresAt) ||
    Number(expiresAt) < Math.floor(now.getTime() / 1000)
  ) {
    return false;
  }

  const expected = signature(secret, email, expiresAt, nonce);
  const actualBuffer = Buffer.from(signed);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
