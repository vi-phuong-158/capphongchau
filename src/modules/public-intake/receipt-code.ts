/**
 * Sinh mã tiếp nhận và mã bí mật cho bản kê khai công khai.
 *
 * Quy ước (PLAN_NL §5.4):
 * - Mã tiếp nhận `PC-KK-{NĂM}-{8 ký tự}`; năm theo `Asia/Ho_Chi_Minh` như Case ID.
 * - 8 ký tự = 7 ký tự ngẫu nhiên + 1 ký tự kiểm tra. Ngẫu nhiên, không tuần tự, để không
 *   lộ tổng số hồ sơ và không dò được.
 * - Bảng chữ bỏ ký tự dễ nhầm khi đọc qua điện thoại: 0/O, 1/I/L, U.
 * - Mã bí mật 16 ký tự (30^16 ≈ 78,5 bit) chia nhóm 4 cho dễ nhập.
 */

/** Crockford base32 bỏ thêm 0 và 1 — còn 30 ký tự. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

const RECEIPT_RANDOM_LENGTH = 7;
const SECRET_LENGTH = 16;
const SECRET_GROUP_SIZE = 4;

function randomChars(length: number): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);

  let out = "";
  for (const value of bytes) {
    out += CODE_ALPHABET[value % CODE_ALPHABET.length];
  }
  return out;
}

/** Ký tự kiểm tra: tổng vị trí các ký tự theo modulo độ dài bảng chữ. */
export function checkCharacter(body: string): string {
  let sum = 0;
  for (const char of body) {
    const index = CODE_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error("Mã chứa ký tự ngoài bảng chữ cho phép.");
    }
    sum += index;
  }
  return CODE_ALPHABET[sum % CODE_ALPHABET.length];
}

/** Năm hành chính tính theo `Asia/Ho_Chi_Minh`, không dùng UTC của máy chủ. */
export function receiptYear(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
  }).format(now);
}

export function createReceiptCode(now = new Date()): string {
  const body = randomChars(RECEIPT_RANDOM_LENGTH);
  return `PC-KK-${receiptYear(now)}-${body}${checkCharacter(body)}`;
}

export function isValidReceiptCode(code: string): boolean {
  const match = /^PC-KK-(\d{4})-([A-Z0-9]{8})$/.exec(code.trim().toUpperCase());
  if (!match) {
    return false;
  }

  const suffix = match[2];
  const body = suffix.slice(0, RECEIPT_RANDOM_LENGTH);
  if ([...suffix].some((char) => !CODE_ALPHABET.includes(char))) {
    return false;
  }

  return checkCharacter(body) === suffix[RECEIPT_RANDOM_LENGTH];
}

/** Mã bí mật hiển thị đúng một lần; bản thật chỉ lưu HMAC (PLAN_NL §5.4). */
export function createAccessSecret(): string {
  const raw = randomChars(SECRET_LENGTH);
  const groups: string[] = [];
  for (let index = 0; index < raw.length; index += SECRET_GROUP_SIZE) {
    groups.push(raw.slice(index, index + SECRET_GROUP_SIZE));
  }
  return groups.join("-");
}

/** Bốn ký tự cuối, dùng để bắt người dân xác nhận đã lưu mã trước khi tải giấy tờ. */
export function lastSecretGroup(secret: string): string {
  const groups = secret.split("-");
  return groups[groups.length - 1] ?? "";
}
