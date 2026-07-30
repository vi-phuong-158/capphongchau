import { createHmac } from "node:crypto";

export {
  isValidCertificateLookupInput,
  normalizeCertificateIssueNumber,
} from "./certificate-normalization";

/**
 * Trạng thái cho phép công khai sau khi tra số GCN. Đây là allowlist cố ý: không phát tán mã hồ
 * sơ, số lượng bản ghi, tên chủ sử dụng hay trạng thái nội bộ chi tiết.
 */
export const CERTIFICATE_LOOKUP_STATUSES = ["IN_PROCESSING", "OFFICIALLY_RECEIVED"] as const;
export type CertificateLookupStatus = (typeof CERTIFICATE_LOOKUP_STATUSES)[number];

export const CERTIFICATE_LOOKUP_RATE_WINDOW_SECONDS = 10 * 60;
export const MAX_CERTIFICATE_LOOKUPS_PER_WINDOW = 8;

export interface CertificateLookupResult {
  readonly found: boolean;
  readonly status: CertificateLookupStatus | null;
  readonly guidance: string;
}

export interface CertificateLookupAuditInput {
  readonly rateLimitKey: string;
  readonly lookupFingerprint: string;
  readonly result: CertificateLookupResult;
  readonly source: "PUBLIC" | "SUBMISSION";
}

/**
 * Số phát hành thường được viết kèm dấu cách hoặc gạch (ví dụ `CH 012-345`). Kho chỉ cần một
 * biểu diễn so sánh; bản gốc vẫn giữ nguyên ở dữ liệu hồ sơ, không bị ghi đè bởi hàm này.
 */
export function certificateLookupResult(
  status: CertificateLookupStatus | null,
): CertificateLookupResult {
  if (status === "OFFICIALLY_RECEIVED") {
    return {
      found: true,
      status,
      guidance:
        "Giấy chứng nhận này đã được tiếp nhận chính thức. Không kê khai lại; nếu thông tin thay đổi, liên hệ cán bộ phường.",
    };
  }
  if (status === "IN_PROCESSING") {
    return {
      found: true,
      status,
      guidance:
        "Giấy chứng nhận này đang được xử lý. Không kê khai lại; vui lòng chờ hoặc liên hệ cán bộ phường khi cần bổ sung.",
    };
  }
  return {
    found: false,
    status: null,
    guidance:
      "Chưa tìm thấy hồ sơ theo thông tin đã nhập. Bạn có thể tiếp tục kê khai và tải ảnh Giấy chứng nhận rõ nét.",
  };
}

export function isCertificateLookupRateLimited(attemptCount: number): boolean {
  return attemptCount >= MAX_CERTIFICATE_LOOKUPS_PER_WINDOW;
}

/**
 * Audit chỉ nhận fingerprint một chiều, không nhận số GCN hoặc ngày cấp nguyên văn. `rateLimitKey`
 * cũng là HMAC của nguồn gọi, cho phép giới hạn dò liên tiếp mà không lưu địa chỉ IP thô.
 */
export function certificateLookupAuditMetadata(
  input: CertificateLookupAuditInput,
): Record<string, string | boolean> {
  return {
    source: input.source,
    rateLimitKey: input.rateLimitKey,
    lookupFingerprint: input.lookupFingerprint,
    found: input.result.found,
    status: input.result.status ?? "NOT_FOUND",
  };
}

export function certificateLookupFingerprint(
  pepper: string,
  normalizedIssueNumber: string,
  issueDate: string,
): string {
  return createHmac("sha256", pepper).update(`${normalizedIssueNumber}:${issueDate}`).digest("hex");
}

export function certificateLookupRateLimitKey(pepper: string, source: string): string {
  return createHmac("sha256", pepper).update(source).digest("hex");
}
