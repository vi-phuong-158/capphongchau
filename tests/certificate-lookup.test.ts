import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findExistingCertificates: vi.fn(),
  hasPendingIdentityMatch: vi.fn(),
  lookupCertificateByIssue: vi.fn(),
  appendAudit: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));

vi.mock("@/modules/common/env", () => ({
  loadPublicIntakeEnvironment: () => ({
    DATA_HASH_PEPPER: "d".repeat(32),
    PUBLIC_SESSION_SECRET: "s".repeat(32),
    PUBLIC_ACCESS_CODE_PEPPER: "p".repeat(32),
    MAX_UPLOAD_MB: 30,
    ORIGIN_SHARED_SECRET: "o".repeat(32),
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    APP_BASE_URL: "http://localhost:3000",
    CONSENT_NOTICE_VERSION: "v1",
    MAX_DRAFT_JSON_BYTES: 45000,
    PUBLIC_INTAKE_MODE: "LIVE",
  }),
}));

vi.mock("@/modules/public-intake/turnstile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/public-intake/turnstile")>()),
  verifyTurnstileToken: mocks.verifyTurnstileToken,
}));

vi.mock("@/modules/public-intake/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/public-intake/repository")>()),
  getPublicIntakeRepository: () => ({
    findExistingCertificates: mocks.findExistingCertificates,
    hasPendingIdentityMatch: mocks.hasPendingIdentityMatch,
    lookupCertificateByIssue: mocks.lookupCertificateByIssue,
    appendAudit: mocks.appendAudit,
  }),
}));

import { POST } from "@/app/api/public/certificate-lookup/route";
import { CertificateLookupRateLimitError } from "@/modules/public-intake/repository";

const IDENTITY_NUMBER = "030099001234";

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/public/certificate-lookup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-turnstile-token": "turnstile-token" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/certificate-lookup", () => {
  beforeEach(() => {
    mocks.findExistingCertificates.mockReset();
    mocks.hasPendingIdentityMatch.mockReset();
    mocks.lookupCertificateByIssue.mockReset();
    mocks.appendAudit.mockReset();
    mocks.verifyTurnstileToken.mockReset();
    mocks.verifyTurnstileToken.mockResolvedValue({ ok: true, duplicate: false });
    mocks.findExistingCertificates.mockResolvedValue([]);
    mocks.hasPendingIdentityMatch.mockResolvedValue(false);
    mocks.lookupCertificateByIssue.mockResolvedValue({
      found: false,
      status: null,
      guidance: "Chưa tìm thấy hồ sơ theo thông tin đã nhập.",
    });
    mocks.appendAudit.mockResolvedValue(undefined);
  });

  it("giữ tra cứu QR nhưng chỉ trả DTO tối thiểu, không lộ số GCN", async () => {
    mocks.findExistingCertificates.mockResolvedValue([
      {
        existingRecordId: "r1",
        issueNumber: "CH01234567",
        issueDate: "2020-01-01",
        registryNumber: "CS123",
      },
    ]);

    const response = await POST(
      createRequest({ identityNumber: IDENTITY_NUMBER, fullName: "Nguyễn Văn A" }),
    );
    const body = (await response.json()) as {
      found: boolean;
      status: string | null;
      guidance: string;
    };

    expect(response.status).toBe(200);
    expect(body.found).toBe(true);
    expect(body.status).toBe("OFFICIALLY_RECEIVED");
    expect(JSON.stringify(body)).not.toContain("CH01234567");
    expect(mocks.appendAudit).toHaveBeenCalledOnce();
    const auditCall = mocks.appendAudit.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(auditCall)).not.toContain(IDENTITY_NUMBER);
  });

  it("trả về chưa khớp khi QR không có GCN nào", async () => {
    const response = await POST(
      createRequest({ identityNumber: IDENTITY_NUMBER, fullName: "Nguyễn Văn A" }),
    );
    const body = (await response.json()) as { found: boolean; status: string | null };

    expect(response.status).toBe(200);
    expect(body.found).toBe(false);
    expect(body.status).toBeNull();
  });

  it("từ chối trước khi chạm Google khi Turnstile không đạt", async () => {
    mocks.verifyTurnstileToken.mockResolvedValue({ ok: false, duplicate: false });

    const response = await POST(
      createRequest({ identityNumber: IDENTITY_NUMBER, fullName: "Nguyễn Văn A" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.findExistingCertificates).not.toHaveBeenCalled();
  });

  it("từ chối khi thiếu số CCCD hợp lệ hoặc họ tên (chưa quét QR)", async () => {
    const missingName = await POST(createRequest({ identityNumber: IDENTITY_NUMBER }));
    expect(missingName.status).toBe(400);

    const badNumber = await POST(createRequest({ identityNumber: "123", fullName: "A" }));
    expect(badNumber.status).toBe(400);

    expect(mocks.findExistingCertificates).not.toHaveBeenCalled();
  });

  it("cảnh báo khi có hồ sơ khác đang chờ xử lý cùng CCCD", async () => {
    mocks.hasPendingIdentityMatch.mockResolvedValue(true);

    const response = await POST(
      createRequest({ identityNumber: IDENTITY_NUMBER, fullName: "Nguyễn Văn A" }),
    );
    const body = (await response.json()) as { found: boolean; status: string | null };

    expect(body.found).toBe(true);
    expect(body.status).toBe("IN_PROCESSING");
  });

  it("tra GCN chuẩn hóa khoảng trắng, dấu gạch và chữ hoa/thường; chỉ trả trạng thái tối thiểu", async () => {
    mocks.lookupCertificateByIssue.mockResolvedValue({
      found: true,
      status: "IN_PROCESSING",
      guidance: "Đang xử lý.",
    });

    const response = await POST(
      createRequest({
        method: "CERTIFICATE_NUMBER",
        issueNumber: " ch- 012 345 ",
        issueDate: "2020-01-31",
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(mocks.lookupCertificateByIssue).toHaveBeenCalledWith(
      expect.objectContaining({ normalizedIssueNumber: "CH012345", issueDate: "2020-01-31" }),
    );
    expect(body).toMatchObject({ found: true, status: "IN_PROCESSING", guidance: "Đang xử lý." });
    expect(JSON.stringify(body)).not.toContain("CH012345");
  });

  it("từ chối số GCN hoặc ngày cấp sai định dạng trước khi tra cứu", async () => {
    const badNumber = await POST(
      createRequest({ method: "CERTIFICATE_NUMBER", issueNumber: "CH/123", issueDate: "2020-01-01" }),
    );
    const badDate = await POST(
      createRequest({ method: "CERTIFICATE_NUMBER", issueNumber: "CH-123", issueDate: "2020-02-30" }),
    );

    expect(badNumber.status).toBe(400);
    expect(badDate.status).toBe(400);
    expect(mocks.lookupCertificateByIssue).not.toHaveBeenCalled();
  });

  it("từ chối phương thức lạ thay vì âm thầm hạ xuống luồng QR", async () => {
    const response = await POST(createRequest({ method: "OTHER" }));

    expect(response.status).toBe(400);
    expect(mocks.lookupCertificateByIssue).not.toHaveBeenCalled();
  });

  it("chặn dò liên tục khi repository báo vượt giới hạn", async () => {
    mocks.lookupCertificateByIssue.mockRejectedValue(new CertificateLookupRateLimitError());

    const response = await POST(
      createRequest({ method: "CERTIFICATE_NUMBER", issueNumber: "CH-123", issueDate: "2020-01-01" }),
    );
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(429);
    expect(body.error?.code).toBe("RATE_LIMITED");
  });
});
