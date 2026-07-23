import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findExistingCertificates: vi.fn(),
  hasPendingIdentityMatch: vi.fn(),
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

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: () => ({
    findExistingCertificates: mocks.findExistingCertificates,
    hasPendingIdentityMatch: mocks.hasPendingIdentityMatch,
    appendAudit: mocks.appendAudit,
  }),
}));

import { POST } from "@/app/api/public/certificate-lookup/route";

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
    mocks.appendAudit.mockReset();
    mocks.verifyTurnstileToken.mockReset();
    mocks.verifyTurnstileToken.mockResolvedValue({ ok: true, duplicate: false });
    mocks.findExistingCertificates.mockResolvedValue([]);
    mocks.hasPendingIdentityMatch.mockResolvedValue(false);
    mocks.appendAudit.mockResolvedValue(undefined);
  });

  it("trả về che số GCN khi tìm thấy khớp, không lộ số đầy đủ", async () => {
    mocks.findExistingCertificates.mockResolvedValue([
      { existingRecordId: "r1", issueNumber: "CH01234567", issueDate: "2020-01-01", registryNumber: "CS123" },
    ]);

    const response = await POST(
      createRequest({ identityNumber: IDENTITY_NUMBER, fullName: "Nguyễn Văn A" }),
    );
    const body = (await response.json()) as {
      matched: boolean;
      pendingWarning: boolean;
      certificates: Array<{ issueNumberMasked: string; issueDate: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.matched).toBe(true);
    expect(body.certificates).toHaveLength(1);
    expect(body.certificates[0].issueNumberMasked).not.toBe("CH01234567");
    expect(body.certificates[0].issueNumberMasked.endsWith("4567")).toBe(true);
    expect(mocks.appendAudit).toHaveBeenCalledOnce();
    const auditCall = mocks.appendAudit.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(auditCall)).not.toContain(IDENTITY_NUMBER);
  });

  it("trả về chưa khớp khi không có GCN nào", async () => {
    const response = await POST(
      createRequest({ identityNumber: IDENTITY_NUMBER, fullName: "Nguyễn Văn A" }),
    );
    const body = (await response.json()) as { matched: boolean; certificates: unknown[] };

    expect(response.status).toBe(200);
    expect(body.matched).toBe(false);
    expect(body.certificates).toHaveLength(0);
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
    const body = (await response.json()) as { pendingWarning: boolean };

    expect(body.pendingWarning).toBe(true);
  });
});
