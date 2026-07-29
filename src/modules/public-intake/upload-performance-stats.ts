/**
 * Logic thuần cho `scripts/report-upload-performance.ts` — tách riêng để test được mà không cần
 * Postgres thật. File script còn lại chỉ còn phần chạm cơ sở dữ liệu và in ra console.
 */

export interface StatsBucket {
  readonly label: string;
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
}

export function parseWindowDays(argv: readonly string[]): number {
  const found = argv.find((value) => value.startsWith("--days="));
  const parsed = found ? Number(found.slice("--days=".length)) : 30;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 30;
}

export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)));
  return sorted[index];
}

export function summarize(label: string, values: readonly number[]): StatsBucket {
  return {
    label,
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

/** Nhóm theo dung lượng nguồn: ảnh 20 MiB và ảnh 2 MiB không so sánh trực tiếp được với nhau. */
export function sizeBucket(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  if (mib <= 0) return "không rõ";
  if (mib < 2) return "< 2 MiB";
  if (mib < 5) return "2–5 MiB";
  if (mib < 10) return "5–10 MiB";
  return "≥ 10 MiB";
}

export function groupByKey<T>(
  rows: readonly T[],
  key: (row: T) => string,
  value: (row: T) => number,
): StatsBucket[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const label = key(row);
    groups.set(label, [...(groups.get(label) ?? []), value(row)]);
  }
  return [...groups.entries()]
    .map(([label, values]) => summarize(label, values))
    .sort((a, b) => b.count - a.count);
}

/**
 * Tỷ lệ nén trung vị — chỉ tính trên lượt có ĐỦ cả hai số đo. Thiếu một bên là "không biết", không
 * phải "không nén"; gộp chúng vào mẫu sẽ kéo tỷ lệ trung vị lệch về phía không nén được gì.
 */
export function medianCompressionRatio(
  rows: readonly { readonly sourceSizeBytes: number; readonly uploadSizeBytes: number }[],
): { ratio: number; sampleSize: number } | null {
  const ratios = rows
    .filter((row) => row.sourceSizeBytes > 0 && row.uploadSizeBytes > 0)
    .map((row) => row.uploadSizeBytes / row.sourceSizeBytes);
  if (ratios.length === 0) return null;
  return { ratio: percentile(ratios, 0.5), sampleSize: ratios.length };
}
