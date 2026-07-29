import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "@/app/api/submissions/[submissionId]/route";
import { UserRole } from "@/modules/common/domain";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import { emptyOwner, type IntakeDraft } from "@/modules/public-intake/types";

const mockUser = {
  email: "officer@phongchau.gov.vn",
  roles: [UserRole.REVIEW_OFFICER],
  id: "user_1",
};
const mockFindById = vi.fn();
const mockFindStoredMutation = vi.fn();
const mockCommitWorkingPayload = vi.fn();

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

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    findById: (...args: unknown[]) => mockFindById(...args),
    findStoredMutation: (...args: unknown[]) => mockFindStoredMutation(...args),
    commitWorkingPayload: (...args: unknown[]) => mockCommitWorkingPayload(...args),
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

function makeRecord(): SubmissionRecord {
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
    citizenPayload: draft,
    citizenPayloadVersion: 1,
    citizenPayloadAt: "2026-07-29T08:00:00.000Z",
    workingPayload: draft,
    workingPayloadAt: "2026-07-29T08:00:00.000Z",
    workingPayloadBy: mockUser.email,
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
  };
}

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/submissions/sub_1", {
    method: "PATCH",
    headers: {
      "x-csrf-token": "valid-csrf",
      "idempotency-key": "manual-confirmation-key",
      "x-request-id": "req-manual-confirmation",
    },
    body: JSON.stringify({
      version: 1,
      manualIdentityConfirmation: { ownerIds: ["owner_1"] },
    }),
  });
}

describe("PATCH manual identity confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindStoredMutation.mockResolvedValue(null);
  });

  it("writes a manual-confirmation working payload once and replays the stored result", async () => {
    const record = makeRecord();
    mockFindById.mockResolvedValue(record);
    mockCommitWorkingPayload.mockResolvedValue({ ...record, version: 2 });

    const first = await PATCH(makeRequest(), {
      params: Promise.resolve({ submissionId: "sub_1" }),
    });
    expect(first.status).toBe(200);
    const committed = mockCommitWorkingPayload.mock.calls[0][0] as {
      draft: IntakeDraft;
      manualIdentityConfirmationOwnerCount: number;
      requestLogKind: string;
      mutationHash: string;
    };
    expect(committed.requestLogKind).toBe("MANUAL_IDENTITY_CONFIRMATION");
    expect(committed.manualIdentityConfirmationOwnerCount).toBe(1);
    expect(committed.draft.owners[0]).toMatchObject({ identityStatus: "MANUAL_COMPLETE" });

    mockFindStoredMutation.mockResolvedValueOnce({
      mutationHash: committed.mutationHash,
      response: { version: 2 },
    });
    const replay = await PATCH(makeRequest(), {
      params: Promise.resolve({ submissionId: "sub_1" }),
    });

    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ submission: { version: 2 } });
    expect(mockCommitWorkingPayload).toHaveBeenCalledTimes(1);
  });
});
