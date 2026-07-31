/**
 * Số đo một lượt tải ảnh — nơi **duy nhất** quyết định cái gì được ghi xuống và cái gì bị cắt.
 *
 * Nguyên tắc: bảng số đo trả lời câu hỏi "đường truyền nhanh chậm ra sao", không bao giờ trả lời
 * "ai đã tải cái gì". Vì vậy mọi trường đi qua đây đều là số, enum hoặc chuỗi thuộc danh mục
 * đóng. Không có ô văn bản tự do nào — một ô tự do là chỗ để CCCD hay tên tệp lọt vào, và một khi
 * đã ghi thì không gỡ ra được.
 *
 * Toàn bộ số client gửi lên đều bị kẹp về khoảng hợp lệ chứ **không** bị từ chối: số đo là việc
 * phụ, làm hỏng thao tác tải ảnh của người dân vì một con số lệch là đánh đổi sai.
 *
 * `uploadSizeBytes` cố tình **không** lấy từ client — dùng dung lượng Drive đã xác minh. Client
 * báo dung lượng nhỏ hơn thực tế thì mọi kết luận về tỷ lệ nén thành vô nghĩa.
 */

import { z } from "zod";

export const UPLOAD_ATTEMPT_OUTCOMES = ["COMPLETED", "FAILED", "CANCELLED"] as const;
export type UploadAttemptOutcome = (typeof UPLOAD_ATTEMPT_OUTCOMES)[number];

export const CLIENT_PLATFORMS = ["android", "ios", "desktop", "unknown"] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

export const CONNECTION_CLASSES = ["slow-2g", "2g", "3g", "4g", "unknown"] as const;
export type ConnectionClass = (typeof CONNECTION_CLASSES)[number];

export const UPLOAD_DOCUMENT_TYPES = [
  "CITIZEN_ID_FRONT",
  "CITIZEN_ID_BACK",
  "CERTIFICATE",
] as const;

/** Giới hạn khớp CHECK constraint trong migration; vượt thì kẹp, không ném lỗi. */
export const MAX_DURATION_MS = 900_000;
export const MAX_SIZE_BYTES = 268_435_456;
export const MAX_RETRY_COUNT = 100;
/** Nhãn giai đoạn hỏng — danh mục đóng, không nhận chuỗi tự do từ client. */
export const FAILURE_STAGES = ["", "PREPARE", "INITIATE", "UPLOAD", "COMPLETE"] as const;
export type FailureStage = (typeof FAILURE_STAGES)[number];
/** Mã lỗi cho phép ghi lại — cũng là danh mục đóng, vì thông báo lỗi có thể chứa dữ liệu người dùng. */
export const FAILURE_CODES = [
  "",
  "NETWORK",
  "TIMEOUT",
  "CANCELLED",
  "SERVER_REJECTED",
  "DECODE_FAILED",
  "UNKNOWN",
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

/**
 * Phần telemetry client đính kèm vào request.
 *
 * Tất cả đều `optional`: một trình duyệt cũ không đo được gì vẫn phải tải ảnh lên bình thường.
 * `passthrough` bị cấm — trường lạ bị loại bỏ thay vì đi tiếp vào tầng dưới.
 */
export const clientUploadTelemetrySchema = z
  .object({
    attemptId: z.string().uuid().optional(),
    sourceSizeBytes: z.number().optional(),
    sourceMimeType: z
      .enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])
      .optional(),
    sourceWidth: z.number().optional(),
    sourceHeight: z.number().optional(),
    uploadWidth: z.number().optional(),
    uploadHeight: z.number().optional(),
    normalizationVersion: z.string().max(32).optional(),
    prepareDurationMs: z.number().optional(),
    initiateDurationMs: z.number().optional(),
    uploadDurationMs: z.number().optional(),
    retryCount: z.number().optional(),
    clientPlatform: z.enum(CLIENT_PLATFORMS).optional(),
    effectiveConnectionType: z.enum(CONNECTION_CLASSES).optional(),
  })
  .strict();

export type ClientUploadTelemetry = z.infer<typeof clientUploadTelemetrySchema>;

/** Số đo một lượt hỏng, gửi tới endpoint riêng vì lượt đó không có `complete` để bám vào. */
export const uploadFailureMetricSchema = z
  .object({
    documentType: z.enum(UPLOAD_DOCUMENT_TYPES),
    outcome: z.enum(["FAILED", "CANCELLED"]),
    failureStage: z.enum(FAILURE_STAGES).optional(),
    failureCode: z.enum(FAILURE_CODES).optional(),
    clientUpload: clientUploadTelemetrySchema.optional(),
  })
  .strict();

export type UploadFailureMetricInput = z.infer<typeof uploadFailureMetricSchema>;

export interface UploadAttemptMetric {
  readonly attemptId: string;
  readonly submissionId: string;
  readonly documentType: (typeof UPLOAD_DOCUMENT_TYPES)[number];
  readonly outcome: UploadAttemptOutcome;
  readonly sourceSizeBytes: number;
  readonly uploadSizeBytes: number;
  readonly prepareDurationMs: number;
  readonly initiateDurationMs: number;
  readonly uploadDurationMs: number;
  readonly completeDurationMs: number;
  readonly retryCount: number;
  readonly clientPlatform: ClientPlatform;
  readonly effectiveConnectionType: ConnectionClass;
  readonly normalizationVersion: string;
  readonly failureStage: FailureStage;
  readonly failureCode: FailureCode;
}

/** Kẹp về [0, max] và làm tròn. Giá trị không phải số hữu hạn coi như 0 — thà mất một điểm đo. */
export function clampMetricNumber(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), max);
}

/** Chỉ giữ mã phiên bản chuẩn hóa dạng an toàn; mọi thứ khác về rỗng. */
export function safeNormalizationVersion(value: unknown): string {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{1,32}$/.test(value) ? value : "";
}

/** Kích thước ảnh; 0 nghĩa là "không đo được", không phải "ảnh rỗng". */
export function clampDimension(value: unknown): number {
  return clampMetricNumber(value, 100_000);
}

export interface BuildMetricInput {
  readonly attemptId: string;
  readonly submissionId: string;
  readonly documentType: (typeof UPLOAD_DOCUMENT_TYPES)[number];
  readonly outcome: UploadAttemptOutcome;
  /** Dung lượng Drive đã xác minh. 0 khi lượt tải hỏng trước lúc có tệp. */
  readonly verifiedUploadSizeBytes: number;
  /** Thời gian xử lý phía máy chủ, do máy chủ tự đo — client không gửi được. */
  readonly completeDurationMs: number;
  readonly telemetry: ClientUploadTelemetry | undefined;
  readonly failureStage?: FailureStage;
  readonly failureCode?: FailureCode;
}

/**
 * Dựng bản ghi số đo đã làm sạch.
 *
 * Hàm thuần, không chạm cơ sở dữ liệu, nên toàn bộ luật cắt/kẹp kiểm được bằng test mà không cần
 * Supabase thật.
 */
export function buildUploadAttemptMetric(input: BuildMetricInput): UploadAttemptMetric {
  const telemetry = input.telemetry;
  return {
    attemptId: input.attemptId,
    submissionId: input.submissionId,
    documentType: input.documentType,
    outcome: input.outcome,
    sourceSizeBytes: clampMetricNumber(telemetry?.sourceSizeBytes, MAX_SIZE_BYTES),
    uploadSizeBytes: clampMetricNumber(input.verifiedUploadSizeBytes, MAX_SIZE_BYTES),
    prepareDurationMs: clampMetricNumber(telemetry?.prepareDurationMs, MAX_DURATION_MS),
    initiateDurationMs: clampMetricNumber(telemetry?.initiateDurationMs, MAX_DURATION_MS),
    uploadDurationMs: clampMetricNumber(telemetry?.uploadDurationMs, MAX_DURATION_MS),
    completeDurationMs: clampMetricNumber(input.completeDurationMs, MAX_DURATION_MS),
    retryCount: clampMetricNumber(telemetry?.retryCount, MAX_RETRY_COUNT),
    clientPlatform: telemetry?.clientPlatform ?? "unknown",
    effectiveConnectionType: telemetry?.effectiveConnectionType ?? "unknown",
    normalizationVersion: safeNormalizationVersion(telemetry?.normalizationVersion),
    failureStage: input.failureStage ?? "",
    failureCode: input.failureCode ?? "",
  };
}

/**
 * Báo một lần khi đường ghi số đo hỏng.
 *
 * Cả hai chỗ gọi `appendUploadAttempt` đều nuốt lỗi có chủ đích — một lượt tải ảnh đã thành công
 * không được hỏng vì bảng phụ. Nhưng nuốt mà không báo gì thì một bảng hỏng (thiếu migration, sai
 * quyền, sai RLS) nằm im hàng tháng, và lúc cần nghiệm thu ngưỡng hiệu năng mới phát hiện không có
 * số nào. Ghi **một** dòng cho mỗi tiến trình là đủ để thấy trong log Vercel mà không làm ngập log
 * khi sự cố kéo dài.
 *
 * Chỉ ghi mã lỗi Postgres (`42501`, `42P01`…), **không** ghi `error.message`: thông báo lỗi
 * Postgres có thể nhắc lại giá trị của dòng vừa insert.
 */
let uploadMetricFailureReported = false;

export function reportUploadMetricFailure(error: unknown): void {
  if (uploadMetricFailureReported) return;
  uploadMetricFailureReported = true;
  const code = (error as { code?: unknown } | null)?.code;
  console.error(
    "[upload-metrics] Không ghi được public_upload_attempts; số đo tải ảnh đang mất. " +
      `pg_code=${typeof code === "string" ? code : "UNKNOWN"}`,
  );
}

/** Chỉ dùng trong test: đặt lại cờ "đã báo" để mỗi ca kiểm tra chạy độc lập. */
export function resetUploadMetricFailureReport(): void {
  uploadMetricFailureReported = false;
}

export interface FileNormalizationMetadata {
  readonly sourceSizeBytes: number | null;
  readonly sourceMimeType: string | null;
  readonly sourceWidth: number | null;
  readonly sourceHeight: number | null;
  readonly uploadWidth: number | null;
  readonly uploadHeight: number | null;
  readonly normalizationVersion: string;
}

/**
 * Metadata chuẩn hóa gắn vào bản ghi tệp.
 *
 * Trả `null` cho từng ô không đo được thay vì 0: "không biết" và "bằng không" là hai chuyện khác
 * nhau, và báo cáo tỷ lệ nén phải loại được nhóm không biết ra khỏi mẫu.
 */
export function buildFileNormalizationMetadata(
  telemetry: ClientUploadTelemetry | undefined,
): FileNormalizationMetadata {
  const positive = (value: number): number | null => (value > 0 ? value : null);
  return {
    sourceSizeBytes: positive(clampMetricNumber(telemetry?.sourceSizeBytes, MAX_SIZE_BYTES)),
    sourceMimeType: telemetry?.sourceMimeType ?? null,
    sourceWidth: positive(clampDimension(telemetry?.sourceWidth)),
    sourceHeight: positive(clampDimension(telemetry?.sourceHeight)),
    uploadWidth: positive(clampDimension(telemetry?.uploadWidth)),
    uploadHeight: positive(clampDimension(telemetry?.uploadHeight)),
    normalizationVersion: safeNormalizationVersion(telemetry?.normalizationVersion),
  };
}

/**
 * Suy hạng thiết bị từ user agent — **chỉ** trả về một trong bốn nhãn, không bao giờ lưu chuỗi
 * gốc. User agent đầy đủ là dấu vân tay nhận dạng được thiết bị; bốn nhãn thì không.
 */
/**
 * Quy `navigator.connection.effectiveType` về danh mục đóng.
 *
 * Safari không có API này, nên "unknown" là giá trị bình thường chứ không phải lỗi — báo cáo phải
 * tách nhóm đó ra thay vì gộp vào 4g và kết luận sai về tốc độ trung bình.
 */
export function connectionClass(
  hints: { readonly effectiveType?: string } | null | undefined,
): ConnectionClass {
  const value = hints?.effectiveType;
  return (CONNECTION_CLASSES as readonly string[]).includes(value ?? "")
    ? (value as ConnectionClass)
    : "unknown";
}

export function classifyPlatform(userAgent: string | null | undefined): ClientPlatform {
  const agent = (userAgent ?? "").toLowerCase();
  if (!agent) return "unknown";
  if (agent.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(agent)) return "ios";
  if (/windows|macintosh|mac os x|linux|cros/.test(agent)) return "desktop";
  return "unknown";
}
