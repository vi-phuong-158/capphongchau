import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "@/app/api/submissions/[submissionId]/route";
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
const mockCommitOfficialAmendment = vi.fn();
const mockCommitStaffDraftEdit = vi.fn();

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    findById: (...args: unknown[]) => mockFindById(...args),
    findStoredMutation: (...args: unknown[]) => mockFindStoredMutation(...args),
    commitOfficialAmendment: (...args: unknown[]) => mockCommitOfficialAmendment(...args),
    commitStaffDraftEdit: (...args: unknown[]) => mockCommitStaffDraftEdit(...args),
  }),
  SubmissionIdempotencyConflictError: class SubmissionIdempotencyConflictError extends Error {},
  SubmissionVersionConflictError: class SubmissionVersionConflictError extends Error {},
}));

function makeDraft(): IntakeDraft {
  return {
    certificate: { issueNumber: "AD 123456", issueDate: "2020-01-01", registryNumber: "CH001" },
    owners: [
      {
        ...emptyOwner("owner_1"),
        fullName: "Nguyen Van A",
        identityNumber: "025080001234",
        dateOfBirth: "1980-01-01",
        gender: "NAM",
        residenceAddress: "Phuong Phong Chau",
        identityStatus: "PENDING_CONFIRMATION",
      },
    ],
    parcels: [],
    assets: [],
    phone: "0912345678",
    consentAccepted: true,
  };
}

function makeRecord(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  const draft = makeDraft();
  return {
    submissionId: "sub_1",
    receiptCode: "PC-KK-2026-0001",
    status: "UNDER_REVIEW",
    phone: draft.phone,
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
    claimedBy: mockUser.email,
    claimedByDisplayName: "Cán bộ Test",
    intakeChannel: "SELF_SERVICE",
    assistedByEmail: "",
    assistedByDisplayName: "",
    assistedAt: "",
    claimedAt: "2026-07-29T08:00:00.000Z",
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    draft,
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
    internalNotes: "",
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/submissions/sub_1", {
    method: "PATCH",
    headers: {
      "x-csrf-token": "valid-csrf",
      "idempotency-key": "test-key",
      "x-request-id": "req-test",
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/submissions/:id — đóng đường ghi STAFF_DRAFT_EDIT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindStoredMutation.mockResolvedValue(null);
  });

  it("từ chối sửa GCN/chủ sử dụng khi UNDER_REVIEW mà không kèm amendmentReason", async () => {
    mockFindById.mockResolvedValue(makeRecord({ status: "UNDER_REVIEW" }));

    const response = await PATCH(
      makeRequest({
        version: 1,
        certificate: { issueNumber: "AD 999999" },
      }),
      { params: Promise.resolve({ submissionId: "sub_1" }) },
    );

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: { message: string } };
    expect(data.error.message).toMatch(/Bàn làm việc/);
    expect(mockCommitStaffDraftEdit).not.toHaveBeenCalled();
    expect(mockCommitOfficialAmendment).not.toHaveBeenCalled();
  });

  it("vẫn cho điều chỉnh hồ sơ đã ACCEPTED khi kèm amendmentReason hợp lệ", async () => {
    const record = makeRecord({
      status: "ACCEPTED",
      officialCaseId: "PHONGCHAU-2026-000001",
    });
    mockFindById.mockResolvedValue(record);
    mockCommitOfficialAmendment.mockResolvedValue({
      ...record,
      version: 2,
      officialCaseId: "PHONGCHAU-2026-000001",
    });

    const response = await PATCH(
      makeRequest({
        version: 1,
        certificate: { issueNumber: "AD 999999" },
        amendmentReason: "Đối chiếu lại bìa gốc, số phát hành ghi nhầm.",
      }),
      { params: Promise.resolve({ submissionId: "sub_1" }) },
    );

    expect(response.status).toBe(200);
    expect(mockCommitOfficialAmendment).toHaveBeenCalledTimes(1);
    expect(mockCommitStaffDraftEdit).not.toHaveBeenCalled();
    const data = (await response.json()) as { submission: { version: number }; amended: boolean };
    expect(data.amended).toBe(true);
    expect(data.submission.version).toBe(2);
  });
});
