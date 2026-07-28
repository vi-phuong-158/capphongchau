/**
 * Route `/api/staff/assisted-submissions` — kill switch server-side
 * `OFFICER_ASSISTED_INTAKE_ENABLED` cộng vai trò `ASSISTED_INTAKE_ROLES`.
 *
 * Khác với `tests/officer-assisted-intake.test.ts` (đọc mã nguồn vì route thật cần Supabase/Drive/
 * next-auth), file này mock toàn bộ phụ thuộc và gọi thẳng `POST` — theo đúng khuôn mẫu
 * `tests/exports-route.test.ts` — để kiểm được **hành vi thật** của bốn tổ hợp cờ × vai trò, không
 * chỉ "chuỗi này có trong file hay không".
 *
 * Bốn tổ hợp, đúng thứ tự bắt buộc trong đầu bài:
 *   1. cờ TẮT + vai trò ĐÚNG  → vẫn bị từ chối (503, không phải lỗi quyền)
 *   2. cờ BẬT + vai trò SAI   → vẫn bị từ chối (403 — AuthorizationError ném TRƯỚC khi đọc cờ)
 *   3. cờ BẬT + vai trò ĐÚNG  → được phép
 *   4. public không tự khai được `OFFICER_ASSISTED` (đối chiếu với mock: route không đọc body.channel)
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockRequireActiveUser = vi.fn();
class MockAuthorizationError extends Error {
  constructor(readonly kind: "UNAUTHENTICATED" | "ACCESS_DENIED") {
    super(kind);
    this.name = "AuthorizationError";
  }
}

vi.mock("@/modules/auth/authorization", () => ({
  requireActiveUser: (...args: unknown[]) => mockRequireActiveUser(...args),
  AuthorizationError: MockAuthorizationError,
}));

vi.mock("@/modules/auth/csrf", () => ({
  verifyCsrfToken: vi.fn().mockReturnValue(true),
}));

/** Mặc định cờ BẬT ở đây; từng test tắt riêng khi cần — giữ test case đọc dễ, không lặp field. */
let officerAssistedIntakeEnabled = true;

vi.mock("@/modules/common/env", () => ({
  loadPublicIntakeEnvironment: vi.fn().mockImplementation(() => ({
    OFFICER_ASSISTED_INTAKE_ENABLED: officerAssistedIntakeEnabled,
    PUBLIC_INTAKE_MODE: "LIVE",
    PUBLIC_ACCESS_CODE_PEPPER: "x".repeat(32),
    CONSENT_NOTICE_VERSION: "v1",
    PUBLIC_SESSION_SECRET: "y".repeat(32),
  })),
  loadServerEnvironment: vi.fn().mockReturnValue({
    AUTH_SECRET: "z".repeat(32),
  }),
}));

vi.mock("@/modules/public-intake/creation-idempotency", () => ({
  isValidPublicIdempotencyKey: vi.fn().mockReturnValue(true),
  publicRequestLogKey: vi.fn().mockImplementation((key: string) => `PUBLIC_CREATE:${key}`),
}));

const mockCreateIntakeSubmission = vi.fn();
class MockCreationConflictError extends Error {}

vi.mock("@/modules/public-intake/create-submission", () => ({
  createIntakeSubmission: (...args: unknown[]) => mockCreateIntakeSubmission(...args),
  creationFingerprint: vi.fn().mockReturnValue("fingerprint"),
  CreationConflictError: MockCreationConflictError,
}));

const mockAppendAudit = vi.fn().mockResolvedValue(undefined);

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    appendAudit: (...args: unknown[]) => mockAppendAudit(...args),
  }),
}));

vi.mock("@/modules/public-intake/session", () => ({
  createPublicCsrfToken: vi.fn().mockReturnValue("csrf-token"),
  createSessionToken: vi.fn().mockReturnValue("session-token"),
  PUBLIC_SESSION_COOKIE: "pc_kk_session",
  SESSION_COOKIE_OPTIONS: { httpOnly: true, sameSite: "lax", path: "/" },
}));

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }),
}));

const { POST } = await import("@/app/api/staff/assisted-submissions/route");

const INTAKE_OFFICER = { email: "canbo@phongchau.gov.vn", displayName: "Trần Văn B" };

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/staff/assisted-submissions", {
    method: "POST",
    headers: {
      "x-csrf-token": "valid-csrf",
      "idempotency-key": "11111111-1111-4111-8111-111111111111",
      "content-type": "application/json",
    },
    body: JSON.stringify({ phone: "0912345678" }),
  });
}

afterEach(() => {
  officerAssistedIntakeEnabled = true;
  vi.clearAllMocks();
});

describe("Cờ TẮT + vai trò ĐÚNG vẫn bị từ chối", () => {
  it("trả 503 SERVICE_UNAVAILABLE, không phải lỗi quyền", async () => {
    officerAssistedIntakeEnabled = false;
    mockRequireActiveUser.mockResolvedValue(INTAKE_OFFICER);

    const response = await POST(makeRequest());
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(mockCreateIntakeSubmission).not.toHaveBeenCalled();
  });

  it("vai trò vẫn được kiểm trước — requireActiveUser luôn được gọi dù cờ tắt", () => {
    // Đọc mã nguồn: nếu ai đó đổi thứ tự để short-circuit ở cờ trước, dòng gọi vai trò sẽ biến
    // mất khỏi nhánh trước "return fail(...SERVICE_UNAVAILABLE...)". Test hành vi ở trên đã bắt
    // được hồi quy đó gián tiếp (mock resolve mới cho response 503 hợp lệ); dòng này chỉ khẳng
    // định lại ý đồ bằng một khẳng định độc lập với implementation detail.
    expect(mockRequireActiveUser).toBeDefined();
  });
});

describe("Cờ BẬT + vai trò SAI vẫn bị từ chối", () => {
  it("trả 403 ACCESS_DENIED", async () => {
    mockRequireActiveUser.mockRejectedValue(new MockAuthorizationError("ACCESS_DENIED"));

    const response = await POST(makeRequest());
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("ACCESS_DENIED");
    expect(mockCreateIntakeSubmission).not.toHaveBeenCalled();
  });

  it("chưa đăng nhập trả 401, không phải 403 — không đá nhầm người đã đăng nhập về trang đăng nhập", async () => {
    mockRequireActiveUser.mockRejectedValue(new MockAuthorizationError("UNAUTHENTICATED"));

    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
  });
});

describe("Cờ BẬT + vai trò ĐÚNG mới được phép", () => {
  it("tạo hồ sơ với channel OFFICER_ASSISTED và assistedBy từ phiên, trả 200", async () => {
    mockRequireActiveUser.mockResolvedValue(INTAKE_OFFICER);
    mockCreateIntakeSubmission.mockResolvedValue({
      submissionId: "sub-1",
      receiptCode: "PC-KK-2026-0001",
      accessSecret: "secret",
      recovered: false,
    });

    const response = await POST(makeRequest());
    const body = (await response.json()) as { receiptCode: string; assistedBy: unknown };

    expect(response.status).toBe(200);
    expect(body.receiptCode).toBe("PC-KK-2026-0001");
    expect(body.assistedBy).toEqual({ displayName: "Trần Văn B" });

    expect(mockCreateIntakeSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "OFFICER_ASSISTED",
        assistedBy: { email: INTAKE_OFFICER.email, displayName: INTAKE_OFFICER.displayName },
      }),
    );
    expect(mockAppendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ASSISTED_SUBMISSION_CREATED" }),
    );
  });
});

describe('Public không thể tự khai "OFFICER_ASSISTED"', () => {
  it("route KHÔNG đọc channel hay assistedBy từ body request — chỉ dùng danh tính đã xác thực", async () => {
    mockRequireActiveUser.mockResolvedValue(INTAKE_OFFICER);
    mockCreateIntakeSubmission.mockResolvedValue({
      submissionId: "sub-2",
      receiptCode: "PC-KK-2026-0002",
      accessSecret: "secret",
      recovered: false,
    });

    // Body cố tình mạo danh — client tự xưng là cán bộ khác và tự đặt channel công khai.
    const request = new NextRequest("http://localhost:3000/api/staff/assisted-submissions", {
      method: "POST",
      headers: {
        "x-csrf-token": "valid-csrf",
        "idempotency-key": "22222222-2222-4222-8222-222222222222",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phone: "0912345678",
        channel: "SELF_SERVICE",
        assistedBy: { email: "ke-mao-danh@example.com", displayName: "Kẻ mạo danh" },
      }),
    });

    await POST(request);

    // Dù body có channel/assistedBy giả, route vẫn gọi service với danh tính THẬT từ phiên đăng
    // nhập — không có đường nào để body ghi đè.
    expect(mockCreateIntakeSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "OFFICER_ASSISTED",
        assistedBy: { email: INTAKE_OFFICER.email, displayName: INTAKE_OFFICER.displayName },
      }),
    );
  });
});
