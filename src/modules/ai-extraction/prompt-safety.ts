/**
 * Chống prompt injection từ ảnh/PDF GCN (GEMINI.md §6.2): mọi chữ trong tài liệu là dữ liệu cần
 * trích xuất, không phải mệnh lệnh. Nếu kết quả AI trả về chứa dấu hiệu mô hình đã "làm theo" chỉ
 * dẫn giấu trong ảnh thay vì trích xuất dữ liệu thật, phải chặn lại cho cán bộ xem xét — không được
 * âm thầm chấp nhận.
 */

const INJECTION_MARKERS: readonly RegExp[] = [
  /<\s*system\s*>/i,
  /<\s*\/\s*system\s*>/i,
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /bỏ qua\s+(mọi\s+|tất cả\s+)?(hướng dẫn|chỉ dẫn|chỉ thị)\s+(trước|ở trên)/i,
  /you are now/i,
  /new instructions?:/i,
];

export interface PromptInjectionFinding {
  readonly fieldPath: string;
  readonly marker: string;
}

/** Kiểm tra một chuỗi có chứa dấu hiệu prompt injection hay không, không sửa nội dung. */
export function detectPromptInjection(text: string): string[] {
  const matches: string[] = [];
  for (const pattern of INJECTION_MARKERS) {
    if (pattern.test(text)) matches.push(pattern.source);
  }
  return matches;
}

/**
 * Quét đệ quy mọi giá trị chuỗi trong kết quả AI trả về, gắn `fieldPath` cho từng phát hiện để
 * cán bộ biết chính xác trường nào khả nghi. Không sửa/đổi dữ liệu — chỉ báo cáo, việc quyết định
 * chặn hay chỉ cảnh báo thuộc về nơi gọi (validator).
 */
export function scanForPromptInjection(value: unknown, path = "$"): PromptInjectionFinding[] {
  if (typeof value === "string") {
    return detectPromptInjection(value).map((marker) => ({ fieldPath: path, marker }));
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => scanForPromptInjection(item, `${path}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      scanForPromptInjection(child, `${path}.${key}`),
    );
  }
  return [];
}
