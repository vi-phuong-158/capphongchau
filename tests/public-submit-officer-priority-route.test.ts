import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyDraft } from "@/modules/public-intake/types";

const mocks = vi.hoisted(() => ({
  resolvePublicRequest: vi.fn(),
  findStoredMutation: vi.fn(),
  submit: vi.fn(),
  listFiles: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));

// `isEditable`/`isHeldByOfficer` KHÔNG bị mock — đây chính là chốt chặn cần kiểm.
vi.mock("@/modules/public-intake/route-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/public-intake/route-context")>();
  return {
    ...actual,
    resolvePublicRequest: (...args: unknown[]) => mocks.resolvePublicRequest(...args),
  };
});

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    findStoredMutation: (...args: unknown[]) => mocks.findStoredMutation(...args),
    submit: (...args: unknown[]) => mocks.submit(...args),
    listFiles: (...args: unknown[]) => mocks.listFiles(...args),
  }),
  SubmissionIdempotencyConflictError: class extends Error {},
  SubmissionVersionConflictError: class extends Error {},
}));

vi.mock("@/modules/public-intake/turnstile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/public-intake/turnstile")>();
  return {
    ...actual,
    verifyTurnstileToken: (...args: unknown[]) => mocks.verifyTurnstileToken(...args),
  };
});

vi.mock("@/modules/common/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/common/env")>();
  return {
    ...actual,
    loadPublicIntakeEnvironment: vi.fn().mockReturnValue({
      MAX_DRAFT_JSON_BYTES: 256_000,
      TURNSTILE_SECRET_KEY: "test-secret",
      APP_BASE_URL: "http://localhost",
      DATA_HASH_PEPPER: "mock-pepper-at-least-32-chars-long-value",
    }),
  };
});

const { POST } = await import("@/app/api/public/submissions/current/submit/route");

function makeRecord(overrides: Record<string, unknown> = {}) {
  const draft = emptyDraft("owner-1", "parcel-1", "land-use-1");
  draft.phone = "0912345678";
  draft.consentAccepted = true;
  draft.owners[0].fullName = "Nguyen Van A";
  return {
    submissionId: "submission-1",
    receiptCode: "PC-KK-2026-0001",
    status: "NEEDS_SUPPLEMENT",
    version: 4,
    draft,
    claimedBy: "",
    claimedByDisplayName: "",
    ...overrides,
  };
}

function makeRequest() {
  return new Request("http://localhost/api/public/submissions/current/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "11111111-1111-4111-8111-111111111111",
      "x-turnstile-token": "token",
    },
    body: JSON.stringify({}),
  });
}

describe("POST /api/public/submissions/current/submit — cán bộ ưu tiên (Đợt 2A-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findStoredMutation.mockResolvedValue(null);
    mocks.verifyTurnstileToken.mockResolvedValue({ ok: true });
    // Đủ ảnh để qua `validateCitizenRequiredFiles` — bài test này kiểm chốt chặn cán bộ ưu tiên,
    // không phải kiểm luật ảnh bắt buộc.
    mocks.listFiles.mockResolvedValue([
      { ownerId: "owner-1", documentType: "CITIZEN_ID_FRONT", status: "UPLOADED" },
      { ownerId: "owner-1", documentType: "CITIZEN_ID_BACK", status: "UPLOADED" },
      { ownerId: "owner-1", documentType: "CERTIFICATE", status: "UPLOADED" },
    ]);
  });

  it("chặn gửi lại khi cán bộ đang giữ hồ sơ, không gọi submit và không tốn lượt Turnstile", async () => {
    mocks.resolvePublicRequest.mockResolvedValue({
      requestId: "req-held",
      record: makeRecord({
        claimedBy: "officer@phongchau.gov.vn",
        claimedByDisplayName: "Cán bộ A",
      }),
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INVALID_STATE");
    expect(body.error.message).toMatch(/cán bộ phường xử lý/i);
    // Không được ghi gì, và chặn phải xảy ra TRƯỚC Turnstile để không đốt lượt xác minh.
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();

    // Thông báo cho người dân tuyệt đối không được lộ email công vụ của cán bộ.
    expect(body.error.message).not.toContain("officer@phongchau.gov.vn");
  });

  it("vẫn cho gửi lại bình thường khi không còn cán bộ nào giữ hồ sơ", async () => {
    mocks.resolvePublicRequest.mockResolvedValue({
      requestId: "req-free",
      record: makeRecord({ claimedBy: "" }),
    });
    mocks.submit.mockResolvedValue(undefined);

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("RESUBMITTED");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
});
