/** Parser bảo thủ cho dữ liệu QR CCCD; payload gốc tuyệt đối không được lưu. */
export const CITIZEN_ID_QR_PARSER_VERSION = "cccd-pipe-v1";
export const CITIZEN_ID_QR_DECODER_VERSION = "zxing-browser-0.1.5";

export interface ParsedCitizenIdQr {
  readonly identityNumber: string;
  readonly fullName: string;
  readonly dateOfBirth: string;
  readonly gender: "NAM" | "NU";
  readonly residenceAddress: string;
}

function toIsoDate(value: string): string | null {
  const normalized = value.trim();
  const match = /^(\d{2})(\d{2})(\d{4})$/.exec(normalized);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

function normalizeGender(value: string): "NAM" | "NU" | null {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
  if (normalized === "NAM" || normalized === "MALE") return "NAM";
  if (normalized === "NU" || normalized === "FEMALE") return "NU";
  return null;
}

/**
 * Các thẻ mẫu 2021 và nhiều thẻ căn cước 2024 dùng chuỗi `|` với bảy trường chính.
 * Chỉ chấp nhận khi đủ định dạng, không suy đoán từ các token mơ hồ.
 */
export function parseCitizenIdQr(payload: string): ParsedCitizenIdQr | null {
  const fields = payload.split("|").map((field) => field.trim());
  if (fields.length < 7 || !/^\d{12}$/.test(fields[0])) return null;

  const fullName = fields[2].replace(/\s+/g, " ").trim();
  const dateOfBirth = toIsoDate(fields[3]);
  const gender = normalizeGender(fields[4]);
  const residenceAddress = fields[5].replace(/\s+/g, " ").trim();
  if (!fullName || !dateOfBirth || !gender || !residenceAddress) return null;

  return {
    identityNumber: fields[0],
    fullName,
    dateOfBirth,
    gender,
    residenceAddress,
  };
}
