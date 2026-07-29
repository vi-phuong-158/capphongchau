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
 *
 * Logic tính toán (percentile, gộp nhóm, tỷ lệ nén) nằm ở
 * `src/modules/public-intake/upload-performance-stats.ts` — module thuần, test được ở
 * `tests/upload-performance-stats.test.ts` mà không cần Postgres thật. File này chỉ còn phần chạm
 * cơ sở dữ liệu và in ra console.
 */

import { loadEnvConfig } from "@next/env";

import { getDatabase } from "../src/modules/supabase/database";
import {
  groupByKey,
  medianCompressionRatio,
  parseWindowDays,
  sizeBucket,
  summarize,
  type StatsBucket,
} from "../src/modules/public-intake/upload-performance-stats";

loadEnvConfig(process.cwd());

function printTable(title: string, rows: readonly StatsBucket[]): void {
  console.log(`\n${title}`);
  console.log("  nhóm                      n        P50 (ms)   P95 (ms)");
  for (const row of rows) {
    console.log(
      `  ${row.label.padEnd(24)}  ${String(row.count).padStart(6)}   ${String(row.p50).padStart(8)}   ${String(row.p95).padStart(8)}`,
    );
  }
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

  printTable(
    "Thời gian upload theo loại giấy tờ",
    groupByKey(
      completed,
      (row) => row.document_type,
      (row) => row.upload_duration_ms,
    ),
  );
  printTable(
    "Thời gian upload theo dung lượng nguồn",
    groupByKey(
      completed,
      (row) => sizeBucket(Number(row.source_size_bytes)),
      (row) => row.upload_duration_ms,
    ),
  );
  printTable(
    "Thời gian upload theo thiết bị",
    groupByKey(
      completed,
      (row) => row.client_platform,
      (row) => row.upload_duration_ms,
    ),
  );
  printTable(
    "Thời gian upload theo hạng mạng",
    groupByKey(
      completed,
      (row) => row.effective_connection_type,
      (row) => row.upload_duration_ms,
    ),
  );

  const compression = medianCompressionRatio(
    completed.map((row) => ({
      sourceSizeBytes: Number(row.source_size_bytes),
      uploadSizeBytes: Number(row.upload_size_bytes),
    })),
  );
  console.log(
    compression
      ? `\nTỷ lệ nén trung vị: ${compression.ratio.toFixed(3)} (n=${compression.sampleSize}/${completed.length} lượt có đủ số đo)`
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

report(parseWindowDays(process.argv.slice(2)))
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Lỗi không rõ.");
    process.exit(1);
  });
