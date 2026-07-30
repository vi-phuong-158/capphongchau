import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PUT } from "@/app/api/submissions/[submissionId]/internal-notes/route";
import { UserRole } from "@/modules/common/domain";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import { emptyOwner, type IntakeDraft } from "@/modules/public-intake/types";

const mockUser = {
  email: "officer@phongchau.gov.vn",
  displayName: "Cán bộ Test",
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
    DATA_HASH_PEPPER: "mock-pepper-at-least-32-chars-long-value",
  }),
}));

const mockFindById = vi.fn();
const mockFindStoredMutation = vi.fn();
const mockCommitInternalNotes = vi.fn();

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    findById: (...args: unknown[]) => mockFindById(...args),
    findStoredMutation: (...args: unknown[]) => mockFindStoredMutation(...args),
    commitInternalNotes: (...args: unknown[]) => mockCommitInternalNotes(...args),
  }),
  SubmissionIdempotencyConflictError: class SubmissionIdempotencyConflictError extends Error {},
  SubmissionVersionConflictError: class SubmissionVersionConflictError extends Error {},
}));

function makeDraft(): IntakeDraft {
  return {
    certificate: { issueNumber: "AD 123456", issueDate: "2020-01-01", registryNumber: "CH001" },
    owners: [{ ...emptyOwner("owner_1"), fullName: "Nguyen Van A" }],
    parcels: [],
    assets: [],
    phone: "0912345678",
    consentAccepted: true,
  };
}

function makeRecord(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    submissionId: "sub_1",
    receiptCode: "PC-KK-2026-0001",
    status: "UNDER_REVIEW",
    phone: "0912345678",
    version: 1,
    accessCodeHash: "hash",
    failedAttempts: 0,
    lockedUntil: "",
    consentVersion: "v1",
    consentedAt: "2026-07-29T08:00:00.000Z",
    retentionUntil: "",
    driveFolderId: "folder_1",
    officialCaseId: "",
    acceptStep: "",
    claimedBy: "officer@phongchau.gov.vn",
    claimedByDisplayName: "Cán bộ Test",
    intakeChannel: "SELF_SERVICE",
    assistedByEmail: "",
    assistedByDisplayName: "",
    assistedAt: "",
    claimedAt: "2026-07-29T08:00:00.000Z",
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    draft: makeDraft(),
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
    internalNotes: "",
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/submissions/sub_1/internal-notes", {
    method: "PUT",
    headers: {
      "x-csrf-token": "valid-csrf",
      "idempotency-key": "test-key",
      "x-request-id": "req-test",
    },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/submissions/:id/internal-notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindStoredMutation.mockResolvedValue(null);
  });

  it("lưu ghi chú hợp lệ -> 200, gọi commitInternalNotes đúng một lần", async () => {
    const record = makeRecord();
    mockFindById.mockResolvedValue(record);
    mockCommitInternalNotes.mockResolvedValue({ ...record, version: 2 });

    const response = await PUT(
      makeRequest({ expectedVersion: 1, internalNotes: "Hồ sơ nộp trùng, đã xác nhận với dân." }),
      { params: Promise.resolve({ submissionId: "sub_1" }) },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as { submission: { version: number } };
    expect(data.submission.version).toBe(2);
    expect(mockCommitInternalNotes).toHaveBeenCalledTimes(1);
    expect(mockCommitInternalNotes.mock.calls[0][0]).toMatchObject({
      expectedVersion: 1,
      internalNotes: "Hồ sơ nộp trùng, đã xác nhận với dân.",
    });
  });

  it("cho phép ghi chú ngay cả khi hồ sơ ACCEPTED và người khác đang giữ", async () => {
    const record = makeRecord({
      status: "ACCEPTED",
      officialCaseId: "PHONGCHAU-2026-000001",
      claimedBy: "other_officer@phongchau.gov.vn",
    });
    mockFindById.mockResolvedValue(record);
    mockCommitInternalNotes.mockResolvedValue({ ...record, version: 2 });

    const response = await PUT(makeRequest({ expectedVersion: 1, internalNotes: "OK" }), {
      params: Promise.resolve({ submissionId: "sub_1" }),
    });

    expect(response.status).toBe(200);
    expect(mockCommitInternalNotes).toHaveBeenCalledTimes(1);
  });

  it("version lệch -> 409, không gọi commitInternalNotes", async () => {
    mockFindById.mockResolvedValue(makeRecord({ version: 5 }));

    const response = await PUT(makeRequest({ expectedVersion: 1, internalNotes: "abc" }), {
      params: Promise.resolve({ submissionId: "sub_1" }),
    });

    expect(response.status).toBe(409);
    expect(mockCommitInternalNotes).not.toHaveBeenCalled();
  });

  it("thiếu idempotency-key -> 400", async () => {
    const request = new NextRequest("http://localhost:3000/api/submissions/sub_1/internal-notes", {
      method: "PUT",
      headers: { "x-csrf-token": "valid-csrf", "x-request-id": "req-test" },
      body: JSON.stringify({ expectedVersion: 1, internalNotes: "abc" }),
    });

    const response = await PUT(request, { params: Promise.resolve({ submissionId: "sub_1" }) });

    expect(response.status).toBe(400);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it("ghi chú vượt 4000 ký tự -> 400", async () => {
    const response = await PUT(
      makeRequest({ expectedVersion: 1, internalNotes: "a".repeat(4001) }),
      { params: Promise.resolve({ submissionId: "sub_1" }) },
    );

    expect(response.status).toBe(400);
    expect(mockFindById).not.toHaveBeenCalled();
  });
});
