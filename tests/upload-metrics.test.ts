/**
 * Phase 5 — số đo tải ảnh.
 *
 * Hai bất biến được khóa ở đây, theo đúng thứ tự quan trọng:
 *
 *   1. **Không có PII nào lọt vào bảng số đo.** Bảng này để đo đường truyền. Một khi số CCCD hay
 *      tên tệp đã được ghi thì không gỡ ra được, và nó nằm ở một bảng không ai nghĩ tới lúc rà
 *      soát dữ liệu cá nhân.
 *   2. **Số đo hỏng không được làm hỏng việc tải ảnh.** Người dân đã chụp, đã chờ tải xong; trả
 *      lỗi vì một con số thống kê là bắt họ làm lại vì chuyện không liên quan tới họ.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildFileNormalizationMetadata,
  buildUploadAttemptMetric,
  classifyPlatform,
  clampMetricNumber,
  clientUploadTelemetrySchema,
  connectionClass,
  MAX_DURATION_MS,
  MAX_SIZE_BYTES,
  safeNormalizationVersion,
  uploadFailureMetricSchema,
} from "@/modules/public-intake/upload-metrics";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const migration = read("../supabase/migrations/202607280003_upload_attempt_metrics.sql");
const metricsRoute = read(
  "../src/app/api/public/submissions/current/uploads/metrics/route.ts",
);
const completeRoute = read(
  "../src/app/api/public/submissions/current/uploads/complete/route.ts",
);
const metricsModule = read("../src/modules/public-intake/upload-metrics.ts");

describe("Schema telemetry không nhận trường tự do", () => {
  it("loại bỏ mọi trường lạ thay vì cho đi tiếp", () => {
    const parsed = clientUploadTelemetrySchema.safeParse({
      sourceSizeBytes: 100,
      fileName: "cccd-001234567890.jpg",
    });
    expect(parsed.success).toBe(false);
  });

  it("từ chối số CCCD, họ tên, điện thoại dù đặt tên trường thế nào", () => {
    for (const payload of [
      { identityNumber: "001234567890" },
      { fullName: "Nguyễn Văn A" },
      { phone: "0912345678" },
      { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S911B)" },
      { driveFileId: "1AbCdEf" },
      { uploadUrl: "https://www.googleapis.com/upload/..." },
    ]) {
      expect(clientUploadTelemetrySchema.safeParse(payload).success).toBe(false);
    }
  });

  it("mọi trường đều tùy chọn — trình duyệt cũ không đo được vẫn tải ảnh bình thường", () => {
    expect(clientUploadTelemetrySchema.safeParse({}).success).toBe(true);
  });

  it("platform và hạng mạng là danh mục đóng", () => {
    expect(clientUploadTelemetrySchema.safeParse({ clientPlatform: "android" }).success).toBe(true);
    expect(clientUploadTelemetrySchema.safeParse({ clientPlatform: "SM-S911B" }).success).toBe(
      false,
    );
    expect(
      clientUploadTelemetrySchema.safeParse({ effectiveConnectionType: "viettel-4g" }).success,
    ).toBe(false);
  });

  it("giai đoạn và mã lỗi cũng là danh mục đóng — thông báo lỗi có thể chứa dữ liệu người dùng", () => {
    expect(
      uploadFailureMetricSchema.safeParse({
        documentType: "CERTIFICATE",
        outcome: "FAILED",
        failureCode: "NETWORK",
      }).success,
    ).toBe(true);
    expect(
      uploadFailureMetricSchema.safeParse({
        documentType: "CERTIFICATE",
        outcome: "FAILED",
        failureCode: "Không tải được ảnh của bà Nguyễn Thị B",
      }).success,
    ).toBe(false);
  });

  it("outcome của endpoint lỗi không nhận COMPLETED — thành công đi đường complete", () => {
    expect(
      uploadFailureMetricSchema.safeParse({ documentType: "CERTIFICATE", outcome: "COMPLETED" })
        .success,
    ).toBe(false);
  });
});

describe("Kẹp giá trị thay vì từ chối", () => {
  it("kẹp về khoảng khớp CHECK constraint", () => {
    expect(clampMetricNumber(999_999_999, MAX_DURATION_MS)).toBe(MAX_DURATION_MS);
    expect(clampMetricNumber(-5, MAX_DURATION_MS)).toBe(0);
    expect(clampMetricNumber(1234.7, MAX_DURATION_MS)).toBe(1235);
  });

  it("giá trị không phải số hữu hạn về 0, không ném lỗi", () => {
    for (const value of [Number.NaN, Infinity, "1000", null, undefined, {}]) {
      expect(clampMetricNumber(value, MAX_DURATION_MS)).toBe(0);
    }
  });

  it("phiên bản chuẩn hóa chỉ nhận mã an toàn", () => {
    expect(safeNormalizationVersion("intake-v2-1")).toBe("intake-v2-1");
    expect(safeNormalizationVersion("cccd 001234567890")).toBe("");
    expect(safeNormalizationVersion("x".repeat(64))).toBe("");
  });
});

describe("Bản ghi số đo dựng ra không mang PII", () => {
  const metric = buildUploadAttemptMetric({
    attemptId: "11111111-1111-4111-8111-111111111111",
    submissionId: "PC-2026-000001",
    documentType: "CERTIFICATE",
    outcome: "COMPLETED",
    verifiedUploadSizeBytes: 2_000_000,
    completeDurationMs: 120,
    telemetry: {
      sourceSizeBytes: 9_000_000,
      prepareDurationMs: 800,
      initiateDurationMs: 300,
      uploadDurationMs: 4_000,
      retryCount: 1,
      clientPlatform: "android",
      effectiveConnectionType: "4g",
      normalizationVersion: "intake-v2-1",
    },
  });

  it("chỉ gồm số, enum và mã hồ sơ", () => {
    expect(Object.keys(metric).sort()).toEqual(
      [
        "attemptId",
        "clientPlatform",
        "completeDurationMs",
        "documentType",
        "effectiveConnectionType",
        "failureCode",
        "failureStage",
        "initiateDurationMs",
        "normalizationVersion",
        "outcome",
        "prepareDurationMs",
        "retryCount",
        "sourceSizeBytes",
        "submissionId",
        "uploadDurationMs",
        "uploadSizeBytes",
      ].sort(),
    );
  });

  it("dung lượng đã tải lấy từ Drive đã xác minh, không lấy từ client", () => {
    const lying = buildUploadAttemptMetric({
      attemptId: "22222222-2222-4222-8222-222222222222",
      submissionId: "PC-2026-000002",
      documentType: "CERTIFICATE",
      outcome: "COMPLETED",
      verifiedUploadSizeBytes: 5_000_000,
      completeDurationMs: 0,
      // Client khai bừa một con số nhỏ để tỷ lệ nén trông đẹp; số đó không có đường vào.
      telemetry: { sourceSizeBytes: 9_000_000, uploadWidth: 1 },
    });
    expect(lying.uploadSizeBytes).toBe(5_000_000);
  });

  it("thiếu telemetry thì về giá trị mặc định chứ không hỏng", () => {
    const bare = buildUploadAttemptMetric({
      attemptId: "33333333-3333-4333-8333-333333333333",
      submissionId: "PC-2026-000003",
      documentType: "CITIZEN_ID_FRONT",
      outcome: "FAILED",
      verifiedUploadSizeBytes: 0,
      completeDurationMs: 0,
      telemetry: undefined,
      failureStage: "UPLOAD",
      failureCode: "NETWORK",
    });
    expect(bare.clientPlatform).toBe("unknown");
    expect(bare.effectiveConnectionType).toBe("unknown");
    expect(bare.normalizationVersion).toBe("");
    expect(bare.sourceSizeBytes).toBe(0);
  });

  it("kẹp dung lượng vượt trần", () => {
    const huge = buildUploadAttemptMetric({
      attemptId: "44444444-4444-4444-8444-444444444444",
      submissionId: "PC-2026-000004",
      documentType: "CERTIFICATE",
      outcome: "COMPLETED",
      verifiedUploadSizeBytes: MAX_SIZE_BYTES * 10,
      completeDurationMs: 0,
      telemetry: undefined,
    });
    expect(huge.uploadSizeBytes).toBe(MAX_SIZE_BYTES);
  });
});

describe("Metadata chuẩn hóa trên bản ghi tệp", () => {
  it('phân biệt "không biết" với "bằng không"', () => {
    const unknown = buildFileNormalizationMetadata(undefined);
    expect(unknown.sourceSizeBytes).toBeNull();
    expect(unknown.sourceWidth).toBeNull();
    expect(unknown.normalizationVersion).toBe("");
  });

  it("giữ số đo thật khi client gửi đủ", () => {
    const metadata = buildFileNormalizationMetadata({
      sourceSizeBytes: 9_000_000,
      sourceMimeType: "image/heic",
      sourceWidth: 4032,
      sourceHeight: 3024,
      uploadWidth: 3000,
      uploadHeight: 2250,
      normalizationVersion: "intake-v2-1",
    });
    expect(metadata.sourceWidth).toBe(4032);
    expect(metadata.uploadHeight).toBe(2250);
    expect(metadata.sourceMimeType).toBe("image/heic");
  });
});

describe("Phân loại thiết bị không lưu user agent thô", () => {
  it("quy về đúng bốn nhãn", () => {
    expect(classifyPlatform("Mozilla/5.0 (Linux; Android 14; SM-S911B)")).toBe("android");
    expect(classifyPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)")).toBe("ios");
    expect(classifyPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    expect(classifyPlatform("")).toBe("unknown");
    expect(classifyPlatform(null)).toBe("unknown");
    expect(classifyPlatform("con-bot-la")).toBe("unknown");
  });

  it("hạng mạng lạ về unknown, không gộp vào 4g", () => {
    // Safari không có API này. Gộp unknown vào 4g là kết luận mạng nhanh hơn thực tế.
    expect(connectionClass({ effectiveType: "3g" })).toBe("3g");
    expect(connectionClass({ effectiveType: "5g" })).toBe("unknown");
    expect(connectionClass(null)).toBe("unknown");
  });
});

describe("Số đo hỏng không phá luồng tải ảnh", () => {
  it("complete route nuốt lỗi ghi metric", () => {
    expect(completeRoute).toMatch(/appendUploadAttempt\([\s\S]*?\)\s*\.catch\(\(\) => undefined\)/);
  });

  it("telemetry sai định dạng bị bỏ qua chứ không trả 400", () => {
    expect(completeRoute).toContain("clientUploadTelemetrySchema.safeParse");
    expect(completeRoute).toContain("telemetryParse.success ? telemetryParse.data : undefined");
  });

  it("endpoint metric riêng luôn trả 204 và không phản chiếu nội dung đã nhận", () => {
    expect(metricsRoute).toContain("status: 204");
    expect(metricsRoute).not.toContain("parsed.error");
  });

  it("endpoint metric vẫn đòi phiên và CSRF", () => {
    expect(metricsRoute).toContain("resolvePublicRequest(request, { requireCsrf: true })");
  });
});

describe("Migration khóa lại danh mục ở tầng cơ sở dữ liệu", () => {
  it("ràng buộc outcome, platform và hạng mạng", () => {
    expect(migration).toContain("outcome in ('COMPLETED', 'FAILED', 'CANCELLED')");
    expect(migration).toContain("client_platform in ('android', 'ios', 'desktop', 'unknown')");
    expect(migration).toContain(
      "effective_connection_type in ('slow-2g', '2g', '3g', '4g', 'unknown')",
    );
  });

  it("chặn số rác làm hỏng P95", () => {
    expect(migration).toContain("between 0 and 900000");
  });

  it("không có cột nào để chứa PII", () => {
    for (const forbidden of [
      "file_name",
      "identity",
      "citizen_id",
      "phone",
      "full_name",
      "user_agent",
      "drive_file_id",
      "upload_url",
      "ip_address",
    ]) {
      expect(migration.toLowerCase()).not.toContain(`${forbidden} `);
    }
  });

  it("xóa hồ sơ là số đo đi theo", () => {
    expect(migration).toContain("on delete cascade");
  });

  it("module số đo không có ô văn bản tự do nào", () => {
    // `z.string()` trần là cửa để dữ liệu tự do lọt vào. Chỉ chấp nhận string có ràng buộc.
    expect(metricsModule).not.toMatch(/z\.string\(\)(?!\.(uuid|max))/);
  });
});
