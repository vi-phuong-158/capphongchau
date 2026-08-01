import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/submissions/[submissionId]/action/route";
import { UserRole } from "@/modules/common/domain";

const mockUser = {
  email: "officer@phongchau.gov.vn",
  roles: [UserRole.REVIEW_OFFICER],
  id: "user_1",
};

vi.mock("@/modules/auth/authorization", () => ({
  requireActiveUser: vi.fn().mockImplementation(async () => mockUser),
  AuthorizationError: class AuthorizationError extends Error {
    kind: "ACCESS_DENIED" | "UNAUTHENTICATED";
    constructor(kind: "ACCESS_DENIED" | "UNAUTHENTICATED", message: string) {
      super(message);
      this.kind = kind;
    }
  },
}));

vi.mock("@/modules/auth/csrf", () => ({
  verifyCsrfToken: vi.fn().mockReturnValue(true),
}));

vi.mock("@/modules/common/env", () => ({
  loadServerEnvironment: vi.fn().mockReturnValue({
    AUTH_SECRET: "mock-secret-at-least-32-chars-long-security",
  }),
}));

const mockFindStoredMutation = vi.fn();
const mockFindById = vi.fn();
const mockCommitStaffAction = vi.fn();

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    findStoredMutation: (...args: unknown[]) => mockFindStoredMutation(...args),
    findById: (...args: unknown[]) => mockFindById(...args),
    commitStaffAction: (...args: unknown[]) => mockCommitStaffAction(...args),
  }),
  SubmissionAlreadyClaimedError: class SubmissionAlreadyClaimedError extends Error {},
  SubmissionVersionConflictError: class SubmissionVersionConflictError extends Error {},
}));

vi.mock("@/modules/users/supabase-user-repository", () => ({
  getUserRepository: vi.fn().mockReturnValue({ findActiveByEmail: vi.fn() }),
}));

function makeRequest(action: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/submissions/sub_1/action", {
    method: "POST",
    headers: {
      "x-csrf-token": "valid-csrf",
      "idempotency-key": "test-key",
      "x-request-id": "req-test",
    },
    body: JSON.stringify({
      action,
      version: 1,
      reasonCode: "MISSING_INFORMATION",
      message: "Vui lòng bổ sung",
      items: [
        {
          itemType: "FIELD",
          targetEntityType: "SUBMISSION",
          fieldPath: "certificate.issueNumber",
          documentType: "",
          instruction: "Bổ sung số phát hành",
        },
      ],
    }),
  });
}

describe("POST /api/submissions/:id/action — REQUEST_SUPPLEMENT disabled", () => {
  it("từ chối REQUEST_SUPPLEMENT trước khi chạm CSDL và không phát sinh audit/idempotency", async () => {
    const response = await POST(makeRequest("REQUEST_SUPPLEMENT"), {
      params: Promise.resolve({ submissionId: "sub_1" }),
    });
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: { code: string; message: string } };
    expect(data.error.code).toBe("VALIDATION_FAILED");
    expect(data.error.message).toMatch(/ngừng sử dụng/);
    expect(mockFindStoredMutation).not.toHaveBeenCalled();
    expect(mockFindById).not.toHaveBeenCalled();
    expect(mockCommitStaffAction).not.toHaveBeenCalled();
  });
});

/**
 * Yêu cầu nghiệp vụ đã chốt: thanh thao tác chính chỉ còn **Tiếp nhận / Lưu / Hoàn thành xử lý**.
 *
 * "Từ chối" là thao tác không hoàn tác được, thực tế rất ít dùng, mà lại nằm ngay cạnh "Hoàn thành
 * xử lý" — hai nút đối nghịch đặt sát nhau là chỗ bấm nhầm. Nó phải nằm trong menu "Thao tác khác".
 * Khóa vị trí bằng cấu trúc JSX vì đây là quan hệ thứ tự trong một tệp, không quan sát được qua API.
 */
describe("vị trí nút Từ chối trên màn duyệt hồ sơ", () => {
  const detail = readFileSync(
    fileURLToPath(new URL("../src/components/submission-detail.tsx", import.meta.url)),
    "utf8",
  );

  it('"Từ chối" nằm trong menu "Thao tác khác", không nằm trên thanh thao tác chính', () => {
    const menuStart = detail.indexOf("⋯ Thao tác khác");
    const rejectButton = detail.indexOf('void action("REJECT")');

    expect(menuStart).toBeGreaterThan(0);
    expect(rejectButton).toBeGreaterThan(menuStart);
  });

  it("vẫn giữ một lần xác nhận trước khi gọi REJECT", () => {
    const rejectBlock = detail.slice(
      detail.indexOf("⋯ Thao tác khác"),
      detail.indexOf('void action("REJECT")'),
    );
    expect(rejectBlock).toContain("window.confirm");
    expect(rejectBlock).toContain("không thể hoàn tác");
  });

  it('"Hoàn thành xử lý" vẫn nằm trên thanh thao tác chính, trước menu phụ', () => {
    const complete = detail.indexOf("Hoàn thành xử lý</button>".slice(0, 16));
    expect(complete).toBeGreaterThan(0);
    expect(complete).toBeLessThan(detail.indexOf("⋯ Thao tác khác"));
  });
});
