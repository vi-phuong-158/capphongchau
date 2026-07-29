import { describe, expect, it } from "vitest";

import {
  certificateLookupAuditMetadata,
  certificateLookupResult,
  isCertificateLookupRateLimited,
  MAX_CERTIFICATE_LOOKUPS_PER_WINDOW,
} from "@/modules/public-intake/certificate-lookup";
import {
  isValidCertificateLookupInput,
  normalizeCertificateIssueNumber,
} from "@/modules/public-intake/certificate-normalization";

describe("tra cứu theo số Giấy chứng nhận", () => {
  it("chuẩn hóa khoảng trắng, dấu gạch và chữ hoa/thường trước khi đối chiếu", () => {
    expect(normalizeCertificateIssueNumber(" ch- 012 345 ")).toBe("CH012345");
    expect(isValidCertificateLookupInput("ch-012 345", "2020-02-29")).toBe(true);
    expect(normalizeCertificateIssueNumber("ađ 266864")).toBe("AĐ266864");
    expect(isValidCertificateLookupInput("AĐ 266864", "2006-02-20")).toBe(true);
  });

  it("từ chối ký tự không phải số/chữ và ngày không tồn tại", () => {
    expect(isValidCertificateLookupInput("CH/012", "2020-01-01")).toBe(false);
    expect(isValidCertificateLookupInput("CH012", "2023-02-29")).toBe(false);
  });

  it("trả đúng status và hướng dẫn tối thiểu cho hồ sơ đang xử lý hoặc đã tiếp nhận", () => {
    expect(certificateLookupResult("IN_PROCESSING")).toMatchObject({
      found: true,
      status: "IN_PROCESSING",
    });
    expect(certificateLookupResult("OFFICIALLY_RECEIVED")).toMatchObject({
      found: true,
      status: "OFFICIALLY_RECEIVED",
    });
    expect(certificateLookupResult(null)).toMatchObject({ found: false, status: null });
  });

  it("chỉ cho tối đa số lượt quy định trong cửa sổ chống dò liên tục", () => {
    expect(isCertificateLookupRateLimited(MAX_CERTIFICATE_LOOKUPS_PER_WINDOW - 1)).toBe(false);
    expect(isCertificateLookupRateLimited(MAX_CERTIFICATE_LOOKUPS_PER_WINDOW)).toBe(true);
  });

  it("audit dùng fingerprint, không chứa số GCN hay ngày cấp nguyên văn", () => {
    const rawIssueNumber = "CH012345";
    const rawIssueDate = "2020-01-31";
    const metadata = certificateLookupAuditMetadata({
      source: "PUBLIC",
      rateLimitKey: "rate-key-hmac",
      lookupFingerprint: "lookup-hmac",
      result: certificateLookupResult("IN_PROCESSING"),
    });

    expect(JSON.stringify(metadata)).not.toContain(rawIssueNumber);
    expect(JSON.stringify(metadata)).not.toContain(rawIssueDate);
    expect(metadata).toMatchObject({ found: true, status: "IN_PROCESSING" });
  });
});
