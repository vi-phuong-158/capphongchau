import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFindStoredMutation = vi.fn();

vi.mock("@/modules/auth/authorization", () => ({
  requireActiveUser: vi.fn().mockResolvedValue({
    id: "user_1",
    email: "officer@phongchau.gov.vn",
    roles: ["REVIEW_OFFICER"],
  }),
  AuthorizationError: class AuthorizationError extends Error {
    readonly kind = "ACCESS_DENIED" as const;
  },
}));

vi.mock("@/modules/auth/csrf", () => ({ verifyCsrfToken: vi.fn().mockReturnValue(true) }));
vi.mock("@/modules/common/env", () => ({
  loadServerEnvironment: vi.fn().mockReturnValue({ AUTH_SECRET: "a".repeat(32) }),
}));
vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    findStoredMutation: (...args: unknown[]) => mockFindStoredMutation(...args),
  }),
  SubmissionIdempotencyConflictError: class SubmissionIdempotencyConflictError extends Error {},
  SubmissionVersionConflictError: class SubmissionVersionConflictError extends Error {},
}));
vi.mock("@/modules/ai-extraction/repository", () => ({
  getAiExtractionRepository: vi.fn(),
}));

import { POST } from "@/app/api/submissions/[submissionId]/ai-draft/apply/route";

describe("POST /api/submissions/:submissionId/ai-draft/apply", () => {
  it("A1: replay trả nguyên response đã cache, gồm các trường AI đã nạp", async () => {
    mockFindStoredMutation.mockResolvedValueOnce({
      kind: "WORKING_PAYLOAD_EDIT",
      mutationHash: "hash",
      response: {
        version: 5,
        updatedAt: "2026-07-26T10:11:12.000Z",
        aiResultId: "aires_1",
        expectedVersion: 4,
        appliedFieldPaths: ["certificate.issueDate", "certificate.registryNumber"],
        requestId: "request-lan-dau",
      },
    });
    const request = new NextRequest("http://localhost:3000/api/submissions/sub_1/ai-draft/apply", {
      method: "POST",
      headers: {
        "x-csrf-token": "csrf",
        "idempotency-key": "apply-replay",
        "x-request-id": "request-retry",
      },
      body: JSON.stringify({ expectedVersion: 4, resultId: "aires_1" }),
    });

    const response = await POST(request, { params: Promise.resolve({ submissionId: "sub_1" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      submission: { version: 5, updatedAt: "2026-07-26T10:11:12.000Z" },
      appliedFieldPaths: ["certificate.issueDate", "certificate.registryNumber"],
      requestId: "request-lan-dau",
    });
  });
});
