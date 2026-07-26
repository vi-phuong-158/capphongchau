/**
 * Không cho kết quả AI mang số CCCD vào kho nháp. Dù chuỗi 12 số có thể là dữ
 * liệu khác, hệ thống chọn fail-closed: cán bộ nhập tay thay vì lưu rủi ro PII.
 */
const CITIZEN_ID_LIKE_PATTERN = /(?<!\d)(?:\d[ .-]?){11}\d(?!\d)/;

export interface CitizenIdLikeFinding {
  readonly fieldPath: string;
}

export function scanForCitizenIdLikeValues(value: unknown, path = "$"): CitizenIdLikeFinding[] {
  if (typeof value === "string") {
    return CITIZEN_ID_LIKE_PATTERN.test(value) ? [{ fieldPath: path }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => scanForCitizenIdLikeValues(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) =>
    scanForCitizenIdLikeValues(nested, path === "$" ? key : `${path}.${key}`),
  );
}
