/**
 * Không cho kết quả AI mang số CCCD vào kho nháp. Dù chuỗi 12 số có thể là dữ
 * liệu khác, hệ thống chọn fail-closed: cán bộ nhập tay thay vì lưu rủi ro PII.
 */
const CITIZEN_ID_LIKE_PATTERN = /(?<!\d)(?:\d[ .-]?){11}\d(?!\d)/;

export interface CitizenIdLikeFinding {
  readonly fieldPath: string;
}

export interface CitizenIdLikeScanOptions {
  /**
   * Tên khóa của object cần bỏ qua khi quét: các định danh do máy sinh (fileId là UUID, hash bộ
   * ảnh sha256, stable key, metadata phiên bản/model) chứ KHÔNG phải chữ đọc từ ảnh GCN. UUID/sha256
   * có thể chứa 12 chữ số liền hoặc ngăn bằng gạch nên bị nhận nhầm là CCCD. Chỉ áp cho khóa của
   * object; mọi giá trị nghiệp vụ và evidence.rawText/note/warning vẫn bị quét đầy đủ.
   */
  readonly skipKeys?: ReadonlySet<string>;
}

export function scanForCitizenIdLikeValues(
  value: unknown,
  options: CitizenIdLikeScanOptions = {},
  path = "$",
): CitizenIdLikeFinding[] {
  if (typeof value === "string") {
    return CITIZEN_ID_LIKE_PATTERN.test(value) ? [{ fieldPath: path }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      scanForCitizenIdLikeValues(item, options, `${path}[${index}]`),
    );
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) =>
    options.skipKeys?.has(key)
      ? []
      : scanForCitizenIdLikeValues(nested, options, path === "$" ? key : `${path}.${key}`),
  );
}
