/**
 * `scripts/report-upload-performance.ts` chạm Postgres thật, nên logic tính toán được tách sang
 * `upload-performance-stats.ts` (thuần) để test được ở đây — không cần môi trường preview.
 *
 * Đây là bằng chứng "script hoạt động đúng ở môi trường local/test" theo đúng nghĩa làm được:
 * không có Postgres/Drive thật trong phiên thi công này, nhưng phần tính toán — chỗ dễ sai nhất
 * (percentile lệch, gộp nhầm nhóm, tỷ lệ nén tính cả mẫu thiếu số đo) — được kiểm đầy đủ bằng dữ
 * liệu dựng sẵn.
 */
import { describe, expect, it } from "vitest";

import {
  groupByKey,
  medianCompressionRatio,
  parseWindowDays,
  percentile,
  sizeBucket,
  summarize,
} from "@/modules/public-intake/upload-performance-stats";

describe("parseWindowDays", () => {
  it("mặc định 30 ngày khi không truyền --days", () => {
    expect(parseWindowDays([])).toBe(30);
  });

  it("đọc đúng số ngày truyền vào", () => {
    expect(parseWindowDays(["--days=7"])).toBe(7);
  });

  it("giá trị âm, 0, hoặc không phải số về lại mặc định 30", () => {
    expect(parseWindowDays(["--days=-5"])).toBe(30);
    expect(parseWindowDays(["--days=0"])).toBe(30);
    expect(parseWindowDays(["--days=abc"])).toBe(30);
  });

  it("làm tròn xuống số ngày lẻ", () => {
    expect(parseWindowDays(["--days=7.9"])).toBe(7);
  });
});

describe("percentile", () => {
  it("mảng rỗng trả 0, không ném lỗi", () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it("P50 và P95 đúng trên tập đã biết trước (nearest-rank: index = floor(fraction × (n-1)))", () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1); // 1..100
    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.95)).toBe(95);
  });

  it("không phá thứ tự mảng gốc — sort trên bản sao", () => {
    const values = [30, 10, 20];
    percentile(values, 0.5);
    expect(values).toEqual([30, 10, 20]);
  });

  it("một phần tử duy nhất trả đúng phần tử đó ở mọi phân vị", () => {
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0.95)).toBe(42);
  });
});

describe("summarize", () => {
  it("gộp count/p50/p95 đúng nhãn", () => {
    const bucket = summarize("upload", [100, 200, 300, 400, 500]);
    expect(bucket.label).toBe("upload");
    expect(bucket.count).toBe(5);
    expect(bucket.p50).toBe(300);
  });
});

describe("sizeBucket — nhóm dung lượng nguồn", () => {
  it("phân đúng bốn khoảng và nhóm không rõ", () => {
    const MiB = 1024 * 1024;
    expect(sizeBucket(0)).toBe("không rõ");
    expect(sizeBucket(1.5 * MiB)).toBe("< 2 MiB");
    expect(sizeBucket(3 * MiB)).toBe("2–5 MiB");
    expect(sizeBucket(8 * MiB)).toBe("5–10 MiB");
    expect(sizeBucket(15 * MiB)).toBe("≥ 10 MiB");
  });

  it("ranh giới đúng khoảng — 2 MiB thuộc nhóm 2–5, không thuộc < 2", () => {
    const MiB = 1024 * 1024;
    expect(sizeBucket(2 * MiB)).toBe("2–5 MiB");
    expect(sizeBucket(5 * MiB)).toBe("5–10 MiB");
    expect(sizeBucket(10 * MiB)).toBe("≥ 10 MiB");
  });
});

describe("groupByKey", () => {
  it("gộp theo nhãn và sắp xếp nhóm đông nhất lên trước", () => {
    const rows = [
      { platform: "android", ms: 100 },
      { platform: "android", ms: 200 },
      { platform: "ios", ms: 50 },
    ];
    const buckets = groupByKey(
      rows,
      (row) => row.platform,
      (row) => row.ms,
    );
    expect(buckets[0].label).toBe("android");
    expect(buckets[0].count).toBe(2);
    expect(buckets[1].label).toBe("ios");
    expect(buckets[1].count).toBe(1);
  });

  it("mảng rỗng trả mảng rỗng", () => {
    expect(
      groupByKey(
        [],
        () => "x",
        () => 0,
      ),
    ).toEqual([]);
  });
});

describe("medianCompressionRatio", () => {
  it("chỉ tính trên lượt có ĐỦ cả hai số đo — không coi thiếu số đo là tỷ lệ 1", () => {
    const result = medianCompressionRatio([
      { sourceSizeBytes: 10_000_000, uploadSizeBytes: 2_000_000 }, // ratio 0.2
      { sourceSizeBytes: 10_000_000, uploadSizeBytes: 3_000_000 }, // ratio 0.3
      { sourceSizeBytes: 0, uploadSizeBytes: 0 }, // thiếu số đo — phải bị loại khỏi mẫu
    ]);
    expect(result).not.toBeNull();
    expect(result!.sampleSize).toBe(2);
    // percentile dùng nearest-rank (không nội suy): 2 mẫu sắp xếp [0.2, 0.3], P50 lấy phần tử ở
    // index floor(0.5×1)=0 → 0.2, không phải trung bình cộng 0.25.
    expect(result!.ratio).toBeCloseTo(0.2, 5);
  });

  it("không có lượt nào đủ số đo → null, không phải 0 hay NaN", () => {
    expect(medianCompressionRatio([{ sourceSizeBytes: 0, uploadSizeBytes: 0 }])).toBeNull();
    expect(medianCompressionRatio([])).toBeNull();
  });
});
