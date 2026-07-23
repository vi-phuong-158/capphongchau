import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  create: vi.fn(),
  createSubmissionFolder: vi.fn(),
  findCreationByIdempotencyKey: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: mocks.cookieSet })),
}));

vi.mock("@/modules/common/env", () => ({
  loadPublicIntakeEnvironment: () => ({
    PUBLIC_SESSION_SECRET: "s".repeat(32),
    PUBLIC_ACCESS_CODE_PEPPER: "p".repeat(32),
    MAX_UPLOAD_MB: 30,
    ORIGIN_SHARED_SECRET: "o".repeat(32),
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    APP_BASE_URL: "http://localhost:3000",
    CONSENT_NOTICE_VERSION: "v1",
    PUBLIC_INTAKE_MODE: "LIVE",
  }),
}));

vi.mock("@/modules/public-intake/turnstile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/public-intake/turnstile")>()),
  verifyTurnstileToken: mocks.verifyTurnstileToken,
}));

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: () => ({
    create: mocks.create,
    findCreationByIdempotencyKey: mocks.findCreationByIdempotencyKey,
  }),
}));

vi.mock("@/modules/public-intake/storage", () => ({
  getPublicIntakeStorage: () => ({
    createSubmissionFolder: mocks.createSubmissionFolder,
  }),
}));

import { POST } from "@/app/api/public/submissions/route";
import { deriveCreationFingerprint } from "@/modules/public-intake/creation-idempotency";

const IDEMPOTENCY_KEY = "123e4567-e89b-42d3-a456-426614174000";
const PHONE_FINGERPRINT = deriveCreationFingerprint("p".repeat(32), "0912345678", "v1");

function createRequest(phone = "0912345678", idempotencyKey = IDEMPOTENCY_KEY): Request {
  return new Request("http://localhost/api/public/submissions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      "x-turnstile-token": "turnstile-token",
    },
    body: JSON.stringify({ phone, consent: { accepted: true, version: "v1" } }),
  });
}

describe("POST /api/public/submissions", () => {
  beforeEach(() => {
    mocks.cookieSet.mockReset();
    mocks.create.mockReset();
    mocks.createSubmissionFolder.mockReset();
    mocks.findCreationByIdempotencyKey.mockReset();
    mocks.findCreationByIdempotencyKey.mockResolvedValue(null);
    mocks.createSubmissionFolder.mockResolvedValue("drive-folder-internal");
    mocks.create.mockResolvedValue(undefined);
    mocks.verifyTurnstileToken.mockReset();
    mocks.verifyTurnstileToken.mockResolvedValue({ ok: true, duplicate: false });
  });

  it("tạo nháp cùng dấu vết idempotency và không lưu mã bí mật rõ", async () => {
    const response = await POST(createRequest());
    const body = (await response.json()) as {
      accessSecret: string;
      receiptCode: string;
      recovered: boolean;
    };

    expect(response.status).toBe(200);
    expect(body.recovered).toBe(false);
    expect(body.receiptCode).toMatch(/^PC-KK-\d{4}-[A-Z0-9]{8}$/);
    expect(body.accessSecret).toMatch(/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/);
    expect(mocks.create).toHaveBeenCalledOnce();
    const stored = mocks.create.mock.calls[0][0] as Record<string, unknown>;
    expect(stored.idempotencyKey).toBe(`PUBLIC_CREATE:${IDEMPOTENCY_KEY}`);
    expect(stored).not.toHaveProperty("accessSecret");
    expect(stored.accessCodeHash).not.toBe(body.accessSecret);
  });

  it("trả lại đúng kết quả cũ khi response đầu bị mất, không ghi Drive hoặc Sheets lần hai", async () => {
    const firstResponse = await POST(createRequest());
    const first = (await firstResponse.json()) as { accessSecret: string; receiptCode: string };
    const stored = mocks.create.mock.calls[0][0] as {
      submissionId: string;
      receiptCode: string;
      mutationHash: string;
    };

    vi.clearAllMocks();
    mocks.findCreationByIdempotencyKey.mockResolvedValue({
      submissionId: stored.submissionId,
      receiptCode: stored.receiptCode,
      mutationHash: stored.mutationHash,
    });

    const retryResponse = await POST(createRequest());
    const retried = (await retryResponse.json()) as {
      accessSecret: string;
      receiptCode: string;
      recovered: boolean;
    };

    expect(retryResponse.status).toBe(200);
    expect(retried).toMatchObject({
      accessSecret: first.accessSecret,
      receiptCode: first.receiptCode,
      recovered: true,
    });
    expect(mocks.createSubmissionFolder).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.cookieSet).toHaveBeenCalledOnce();
  });

  it("gộp hai retry chồng nhau thành một lần ghi", async () => {
    let releaseFolder: ((folderId: string) => void) | undefined;
    mocks.createSubmissionFolder.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          releaseFolder = resolve;
        }),
    );

    const concurrentKey = "123e4567-e89b-42d3-a456-426614174001";
    const first = POST(createRequest("0912345678", concurrentKey));
    await vi.waitFor(() => expect(mocks.createSubmissionFolder).toHaveBeenCalledOnce());
    const second = POST(createRequest("0912345678", concurrentKey));
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!releaseFolder) throw new Error("Mock Drive chưa cung cấp hàm hoàn tất.");
    releaseFolder("drive-folder-internal");

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    const firstBody = (await firstResponse.json()) as { receiptCode: string; accessSecret: string };
    const secondBody = (await secondResponse.json()) as {
      receiptCode: string;
      accessSecret: string;
    };

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(secondBody).toMatchObject({
      receiptCode: firstBody.receiptCode,
      accessSecret: firstBody.accessSecret,
    });
    expect(mocks.createSubmissionFolder).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("từ chối trước khi chạm Google khi Turnstile không đạt", async () => {
    mocks.verifyTurnstileToken.mockResolvedValue({ ok: false, duplicate: false });

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mocks.findCreationByIdempotencyKey).not.toHaveBeenCalled();
    expect(mocks.createSubmissionFolder).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("token đã dùng vẫn lấy lại được bản nháp cũ: retry trên mạng yếu không bị chặn", async () => {
    mocks.verifyTurnstileToken.mockResolvedValue({ ok: false, duplicate: true });
    mocks.findCreationByIdempotencyKey.mockResolvedValue({
      submissionId: "1f3d4c9a-1111-5222-8333-444455556666",
      receiptCode: "PC-KK-2026-ABCDEFGH",
      mutationHash: PHONE_FINGERPRINT,
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("token đã dùng nhưng chưa từng có bản nháp thì không được tạo mới", async () => {
    mocks.verifyTurnstileToken.mockResolvedValue({ ok: false, duplicate: true });
    mocks.findCreationByIdempotencyKey.mockResolvedValue(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mocks.createSubmissionFolder).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("trả lỗi JSON an toàn khi Google lỗi", async () => {
    mocks.findCreationByIdempotencyKey.mockRejectedValue(new Error("secret stack detail"));

    const response = await POST(
      createRequest("0912345678", "123e4567-e89b-42d3-a456-426614174002"),
    );
    const body = (await response.json()) as {
      error: { code: string; message: string; requestId: string };
    };

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toContain("secret stack detail");
    expect(body.error.requestId).toBeTruthy();
  });
});
