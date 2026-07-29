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
