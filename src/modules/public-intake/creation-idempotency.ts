import { createHmac } from "node:crypto";

import { checkCharacter, CODE_ALPHABET, receiptYear } from "./receipt-code";

const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT_RANDOM_LENGTH = 7;
const ACCESS_SECRET_LENGTH = 16;
const ACCESS_SECRET_GROUP_SIZE = 4;

function digest(secret: string, purpose: string, idempotencyKey: string): Buffer {
  return createHmac("sha256", secret).update(`${purpose}:${idempotencyKey}`).digest();
}

function alphabetChars(bytes: Uint8Array, length: number): string {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return result;
}

function formatUuid(bytes: Buffer): string {
  const value = Buffer.from(bytes.subarray(0, 16));
  // UUID v5/variant RFC 4122: định danh ổn định, nhưng không để lộ trực tiếp idempotency key.
  value[6] = (value[6] & 0x0f) | 0x50;
  value[8] = (value[8] & 0x3f) | 0x80;
  const hex = value.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isValidPublicIdempotencyKey(value: string | null): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value);
}

export function publicRequestLogKey(idempotencyKey: string): string {
  return `PUBLIC_CREATE:${idempotencyKey.toLowerCase()}`;
}

export function deriveSubmissionId(sessionSecret: string, idempotencyKey: string): string {
  return formatUuid(digest(sessionSecret, "submission", idempotencyKey));
}

export function deriveReceiptCode(
  sessionSecret: string,
  idempotencyKey: string,
  now = new Date(),
): string {
  const body = alphabetChars(
    digest(sessionSecret, "receipt", idempotencyKey),
    RECEIPT_RANDOM_LENGTH,
  );
  return `PC-KK-${receiptYear(now)}-${body}${checkCharacter(body)}`;
}

/**
 * Mã bí mật ổn định theo request để server có thể trả lại sau khi response đầu bị mất.
 * Chỉ idempotency key không đủ suy ra mã vì còn cần pepper phía server.
 */
export function deriveAccessSecret(accessPepper: string, idempotencyKey: string): string {
  const raw = alphabetChars(digest(accessPepper, "access", idempotencyKey), ACCESS_SECRET_LENGTH);
  const groups: string[] = [];
  for (let index = 0; index < raw.length; index += ACCESS_SECRET_GROUP_SIZE) {
    groups.push(raw.slice(index, index + ACCESS_SECRET_GROUP_SIZE));
  }
  return groups.join("-");
}

export function deriveCreationFingerprint(
  accessPepper: string,
  phone: string,
  consentVersion: string,
): string {
  return createHmac("sha256", accessPepper)
    .update(`phone:${phone}|consentVersion:${consentVersion}`)
    .digest("hex");
}
