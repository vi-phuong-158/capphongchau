import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFindStoredMutation = vi.fn();
const mockFindById = vi.fn();
const mockCommitWorkingPayload = vi.fn();
const mockGetCurrentComparisons = vi.fn();

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
    findById: (...args: unknown[]) => mockFindById(...args),
    commitWorkingPayload: (...args: unknown[]) => mockCommitWorkingPayload(...args),
  }),
  SubmissionIdempotencyConflictError: class SubmissionIdempotencyConflictError extends Error {},
  SubmissionVersionConflictError: class SubmissionVersionConflictError extends Error {},
}));
vi.mock("@/modules/ai-extraction/repository", () => ({
  getAiExtractionRepository: vi.fn().mockReturnValue({
    getCurrentComparisons: (...args: unknown[]) => mockGetCurrentComparisons(...args),
  }),
}));

import { POST } from "@/app/api/submissions/[submissionId]/ai-draft/apply/route";
import { emptyDraft } from "@/modules/public-intake/types";

function request(body: unknown, idempotencyKey = "apply-selection"): NextRequest {
  return new NextRequest("http://localhost:3000/api/submissions/sub_1/ai-draft/apply", {
    method: "POST",
    headers: {
      "x-csrf-token": "csrf",
      "idempotency-key": idempotencyKey,
      "x-request-id": "request-selection",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/submissions/:submissionId/ai-draft/apply", () => {
  beforeEach(() => vi.clearAllMocks());

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

  it("A2: từ chối danh sách trường trùng hoặc vượt trần trước khi đọc hồ sơ", async () => {
    const duplicate = await POST(
      request({
        expectedVersion: 4,
        resultId: "aires_1",
        selectedFieldPaths: ["certificate.issueDate", "certificate.issueDate"],
      }),
      { params: Promise.resolve({ submissionId: "sub_1" }) },
    );
    const tooMany = await POST(
      request({
        expectedVersion: 4,
        resultId: "aires_1",
        selectedFieldPaths: Array.from({ length: 5_001 }, (_, index) => `field.${index}`),
      }),
      { params: Promise.resolve({ submissionId: "sub_1" }) },
    );

    expect(duplicate.status).toBe(400);
    expect(tooMany.status).toBe(400);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it("A3: replay cùng key nhưng đổi selection trả idempotency conflict", async () => {
    mockFindStoredMutation.mockResolvedValueOnce({
      kind: "WORKING_PAYLOAD_EDIT",
      mutationHash: "hash",
      response: {
        version: 5,
        updatedAt: "2026-07-26T10:11:12.000Z",
        aiResultId: "aires_1",
        expectedVersion: 4,
        appliedFieldPaths: ["certificate.issueDate"],
        requestId: "request-lan-dau",
      },
    });
    const response = await POST(
      request({
        expectedVersion: 4,
        resultId: "aires_1",
        selectedFieldPaths: ["certificate.registryNumber"],
      }),
      { params: Promise.resolve({ submissionId: "sub_1" }) },
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("A2b: nhận selection cỡ hồ sơ 18 thửa thay vì chặn bởi trần body cũ", async () => {
    const draft = emptyDraft("owner_1", "parcel_1", "land_1");
    mockFindStoredMutation.mockResolvedValueOnce(null);
    mockFindById.mockResolvedValueOnce({
      submissionId: "sub_1",
      version: 4,
      claimedBy: "officer@phongchau.gov.vn",
      status: "UNDER_REVIEW",
      draft,
      workingPayload: draft,
    });
    mockGetCurrentComparisons.mockResolvedValueOnce({
      draft: { resultId: "aires_1", validationStatus: "PASSED", payload: {} },
      comparisons: [],
    });
    const response = await POST(
      request({
        expectedVersion: 4,
        resultId: "aires_1",
        selectedFieldPaths: Array.from({ length: 500 }, (_, index) => `parcels[p${index}].area`),
      }),
      { params: Promise.resolve({ submissionId: "sub_1" }) },
    );

    expect(response.status).toBe(400);
    expect(mockFindById).toHaveBeenCalledOnce();
  });

  it("A4: server từ chối field path giả dù client gửi selection", async () => {
    const draft = emptyDraft("owner_1", "parcel_1", "land_1");
    mockFindStoredMutation.mockResolvedValueOnce(null);
    mockFindById.mockResolvedValueOnce({
      submissionId: "sub_1",
      version: 4,
      claimedBy: "officer@phongchau.gov.vn",
      status: "UNDER_REVIEW",
      draft,
      workingPayload: draft,
    });
    mockGetCurrentComparisons.mockResolvedValueOnce({
      draft: { resultId: "aires_1", validationStatus: "PASSED", payload: {} },
      comparisons: [
        {
          fieldPath: "certificate.issueNumber",
          currentValue: "",
          aiValue: "CS 123",
          sourceValue: "CS 123",
          fieldStatus: "CLEAR",
          evidence: { fileId: "file_gcn_1" },
        },
      ],
    });
    const response = await POST(
      request({
        expectedVersion: 4,
        resultId: "aires_1",
        selectedFieldPaths: ["owners[forged].fullName"],
      }),
      { params: Promise.resolve({ submissionId: "sub_1" }) },
    );

    expect(response.status).toBe(400);
    expect(mockCommitWorkingPayload).not.toHaveBeenCalled();
  });

  it("A5: payload legacy vẫn nạp được trường CLEAR đã chọn", async () => {
    const draft = emptyDraft("owner_1", "parcel_1", "land_1");
    mockFindStoredMutation.mockResolvedValueOnce(null);
    mockFindById.mockResolvedValueOnce({
      submissionId: "sub_1",
      version: 4,
      claimedBy: "officer@phongchau.gov.vn",
      status: "UNDER_REVIEW",
      draft,
      workingPayload: draft,
    });
    mockGetCurrentComparisons.mockResolvedValueOnce({
      draft: {
        resultId: "aires_1",
        jobId: "aijob_1",
        validationStatus: "PASSED",
        payload: { quality: {}, certificate: {}, unreadableFields: [] },
      },
      comparisons: [
        {
          fieldPath: "certificate.issueNumber",
          currentValue: "",
          aiValue: "CS 123",
          sourceValue: "CS 123",
          fieldStatus: "CLEAR",
          evidence: { fileId: "file_gcn_1" },
        },
      ],
    });
    mockCommitWorkingPayload.mockImplementationOnce(async (input: { draft: typeof draft }) => ({
      ...input,
      version: 5,
      updatedAt: "2026-08-03T10:00:00.000Z",
    }));
    const response = await POST(
      request({
        expectedVersion: 4,
        resultId: "aires_1",
        selectedFieldPaths: ["certificate.issueNumber"],
      }),
      { params: Promise.resolve({ submissionId: "sub_1" }) },
    );

    expect(response.status).toBe(200);
    expect(mockCommitWorkingPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          certificate: expect.objectContaining({ issueNumber: "CS 123" }),
        }),
      }),
    );
  });

  it("A6: legacy từ chối toàn bộ selection khi có field không thể nạp để replay luôn idempotent", async () => {
    const draft = emptyDraft("owner_1", "parcel_1", "land_1");
    mockFindStoredMutation.mockResolvedValueOnce(null);
    mockFindById.mockResolvedValueOnce({
      submissionId: "sub_1",
      version: 4,
      claimedBy: "officer@phongchau.gov.vn",
      status: "UNDER_REVIEW",
      draft,
      workingPayload: draft,
    });
    mockGetCurrentComparisons.mockResolvedValueOnce({
      draft: {
        resultId: "aires_1",
        jobId: "aijob_1",
        validationStatus: "PASSED",
        payload: { quality: {}, certificate: {}, unreadableFields: [] },
      },
      comparisons: [
        {
          fieldPath: "certificate.issueNumber",
          currentValue: "",
          aiValue: "CS 123",
          sourceValue: "CS 123",
          fieldStatus: "CLEAR",
          evidence: { fileId: "file_gcn_1" },
        },
        {
          fieldPath: "certificate.issueDate",
          currentValue: "",
          aiValue: null,
          sourceValue: null,
          fieldStatus: "MANUAL_REQUIRED",
          evidence: { fileId: "file_gcn_1" },
        },
      ],
    });

    const response = await POST(
      request({
        expectedVersion: 4,
        resultId: "aires_1",
        selectedFieldPaths: ["certificate.issueNumber", "certificate.issueDate"],
      }),
      { params: Promise.resolve({ submissionId: "sub_1" }) },
    );

    expect(response.status).toBe(400);
    expect(mockCommitWorkingPayload).not.toHaveBeenCalled();
  });
});
