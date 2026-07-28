/**
 * Báo cáo hiệu năng tải ảnh từ `public.public_upload_attempts`.
 *
 *     npx tsx scripts/report-upload-performance.ts --days=7
 *
 * Đây là **nguồn số liệu duy nhất** để nghiệm thu ngưỡng hiệu năng §18 và để quyết định có được
 * bật cờ chuẩn hóa ảnh cho người dân hay không. Trước khi có báo cáo này, mọi phát biểu kiểu "đã
 * nhanh hơn" chỉ là cảm nhận.
 *
 * Chỉ đọc, không ghi, không xóa. Không in PII vì bảng nguồn không chứa PII — không có tên tệp,
 * CCCD, điện thoại, user agent thô hay Drive ID nào để mà in ra.
 *
 * Đọc kết quả cho đúng:
 *   - P95 mới là con số phải nhìn. P50 đẹp mà P95 xấu nghĩa là phần lớn hộ dân ổn, còn nhóm mạng
 *     yếu — chính nhóm đã than phiền — vẫn đang chờ rất lâu.
 *   - Nhóm `unknown` của platform/connection không phải rác: Safari không có API mạng. Đừng gộp
 *     nó vào 4g rồi kết luận mạng nhanh hơn thực tế.
 *   - Tỷ lệ nén chỉ tính trên các tệp **có** số đo nguồn. Tệp nhận trước khi có telemetry để null
 *     và bị loại khỏi mẫu, chứ không được coi là tỷ lệ 1.
 */

import { loadEnvConfig } from "@next/env";

import { getDatabase } from "../src/modules/supabase/database";

loadEnvConfig(process.cwd());

interface Bucket {
  readonly label: string;
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
}

function days(argv: readonly string[]): number {
  const found = argv.find((value) => value.startsWith("--days="));
  const parsed = found ? Number(found.slice("--days=".length)) : 30;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 30;
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)));
  return sorted[index];
}

function summarize(label: string, values: readonly number[]): Bucket {
  return {
    label,
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

function printTable(title: string, rows: readonly Bucket[]): void {
  console.log(`\n${title}`);
  console.log("  nhóm                      n        P50 (ms)   P95 (ms)");
  for (const row of rows) {
    console.log(
      `  ${row.label.padEnd(24)}  ${String(row.count).padStart(6)}   ${String(row.p50).padStart(8)}   ${String(row.p95).padStart(8)}`,
    );
  }
}

/** Nhóm theo dung lượng nguồn: ảnh 20 MiB và ảnh 2 MiB không so sánh trực tiếp được với nhau. */
function sizeBucket(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  if (mib <= 0) return "không rõ";
  if (mib < 2) return "< 2 MiB";
  if (mib < 5) return "2–5 MiB";
  if (mib < 10) return "5–10 MiB";
  return "≥ 10 MiB";
}

interface AttemptRow {
  readonly document_type: string;
  readonly outcome: string;
  readonly source_size_bytes: string | number;
  readonly upload_size_bytes: string | number;
  readonly prepare_duration_ms: number;
  readonly initiate_duration_ms: number;
  readonly upload_duration_ms: number;
  readonly complete_duration_ms: number;
  readonly retry_count: number;
  readonly client_platform: string;
  readonly effective_connection_type: string;
  readonly normalization_version: string;
}

async function report(windowDays: number): Promise<void> {
  const database = getDatabase();
  const rows = await database<AttemptRow[]>`
    select document_type, outcome, source_size_bytes, upload_size_bytes,
      prepare_duration_ms, initiate_duration_ms, upload_duration_ms, complete_duration_ms,
      retry_count, client_platform, effective_connection_type, normalization_version
    from public.public_upload_attempts
    where created_at >= now() - (${windowDays} * interval '1 day')
  `;

  if (rows.length === 0) {
    console.log(
      `Không có lượt tải nào trong ${windowDays} ngày qua. Chưa đủ dữ liệu để kết luận gì.`,
    );
    return;
  }

  const completed = rows.filter((row) => row.outcome === "COMPLETED");
  const failed = rows.filter((row) => row.outcome === "FAILED");
  const cancelled = rows.filter((row) => row.outcome === "CANCELLED");

  console.log(`Cửa sổ: ${windowDays} ngày. Tổng ${rows.length} lượt.`);
  console.log(`  COMPLETED : ${completed.length}`);
  console.log(
    `  FAILED    : ${failed.length}  (${((failed.length / rows.length) * 100).toFixed(1)}%)`,
  );
  console.log(`  CANCELLED : ${cancelled.length}`);
  const retried = rows.filter((row) => row.retry_count > 0).length;
  console.log(`  Có thử lại: ${retried}  (${((retried / rows.length) * 100).toFixed(1)}%)`);

  printTable("Theo giai đoạn (chỉ lượt COMPLETED)", [
    summarize(
      "prepare",
      completed.map((row) => row.prepare_duration_ms),
    ),
    summarize(
      "initiate",
      completed.map((row) => row.initiate_duration_ms),
    ),
    summarize(
      "upload",
      completed.map((row) => row.upload_duration_ms),
    ),
    summarize(
      "complete",
      completed.map((row) => row.complete_duration_ms),
    ),
  ]);

  const groupUpload = (key: (row: AttemptRow) => string): Bucket[] => {
    const groups = new Map<string, number[]>();
    for (const row of completed) {
      const label = key(row);
      groups.set(label, [...(groups.get(label) ?? []), row.upload_duration_ms]);
    }
    return [...groups.entries()]
      .map(([label, values]) => summarize(label, values))
      .sort((a, b) => b.count - a.count);
  };

  printTable(
    "Thời gian upload theo loại giấy tờ",
    groupUpload((row) => row.document_type),
  );
  printTable(
    "Thời gian upload theo dung lượng nguồn",
    groupUpload((row) => sizeBucket(Number(row.source_size_bytes))),
  );
  printTable(
    "Thời gian upload theo thiết bị",
    groupUpload((row) => row.client_platform),
  );
  printTable(
    "Thời gian upload theo hạng mạng",
    groupUpload((row) => row.effective_connection_type),
  );

  // Chỉ tính trên lượt có đủ hai số đo. Thiếu một bên là "không biết", không phải "không nén".
  const ratios = completed
    .filter((row) => Number(row.source_size_bytes) > 0 && Number(row.upload_size_bytes) > 0)
    .map((row) => Number(row.upload_size_bytes) / Number(row.source_size_bytes));
  console.log(
    ratios.length > 0
      ? `\nTỷ lệ nén trung vị: ${percentile(ratios, 0.5).toFixed(3)} (n=${ratios.length}/${completed.length} lượt có đủ số đo)`
      : "\nChưa có lượt nào đủ số đo nguồn/đích để tính tỷ lệ nén.",
  );

  const versions = new Map<string, number>();
  for (const row of completed) {
    const key = row.normalization_version || "(không rõ)";
    versions.set(key, (versions.get(key) ?? 0) + 1);
  }
  console.log("\nPhiên bản chuẩn hóa:");
  for (const [version, count] of versions) console.log(`  ${version.padEnd(16)} ${count}`);
}

report(days(process.argv.slice(2)))
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Lỗi không rõ.");
    process.exit(1);
  });
