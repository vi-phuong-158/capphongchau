import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "@/app/api/submissions/[submissionId]/working-payload/route";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import { UserRole } from "@/modules/common/domain";
import { emptyLandUse, emptyOwner, emptyParcel, type IntakeDraft } from "@/modules/public-intake/types";

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

const mockFindById = vi.fn();
const mockFindStoredMutation = vi.fn().mockResolvedValue(null);
const mockCommitWorkingPayload = vi.fn();

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    findById: (...args: any[]) => mockFindById(...args),
    findStoredMutation: (...args: any[]) => mockFindStoredMutation(...args),
    commitWorkingPayload: (...args: any[]) => mockCommitWorkingPayload(...args),
  }),
  SubmissionVersionConflictError: class SubmissionVersionConflictError extends Error {},
}));

function makeDraft(): IntakeDraft {
  return {
    certificate: { issueNumber: "AD 123456", issueDate: "2020-01-01", registryNumber: "CH001" },
    owners: [
      {
        ...emptyOwner("o1"),
        fullName: "Nguyễn Văn A",
        identityNumber: "025080001234",
        dateOfBirth: "1980-01-01",
        gender: "NAM",
        residenceAddress: "Phong Châu",
        roleOnCertificate: "CA_NHAN",
      },
    ],
    parcels: [
      {
        ...emptyParcel("p1", "l1"),
        parcelNumber: "10",
        area: "100",
        addressOnCertificate: "Phong Châu",
        landUses: [{ ...emptyLandUse("l1"), purposeCode: "ODT", area: "100" }],
      },
    ],
    assets: [],
    phone: "0912345678",
    consentAccepted: true,
  };
}

function makeRecord(claimedBy: string, status: any = "UNDER_REVIEW"): SubmissionRecord {
  const d = makeDraft();
  return {
    submissionId: "sub_1",
    receiptCode: "PC-KK-2026-0001",
    status,
    phone: "0912345678",
    version: 1,
    accessCodeHash: "hash",
    failedAttempts: 0,
    lockedUntil: "",
    consentVersion: "v1",
    consentedAt: new Date().toISOString(),
    retentionUntil: "",
    driveFolderId: "folder_1",
    officialCaseId: "",
    acceptStep: "",
    claimedBy,
    claimedAt: claimedBy ? new Date().toISOString() : "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draft: d,
    citizenPayload: d,
    citizenPayloadVersion: 1,
    citizenPayloadAt: new Date().toISOString(),
    workingPayload: d,
    workingPayloadAt: new Date().toISOString(),
    workingPayloadBy: claimedBy,
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
  };
}

function makeRequest(body: any): NextRequest {
  return new NextRequest("http://localhost:3000/api/submissions/sub_1/working-payload", {
    method: "PUT",
    headers: {
      "x-csrf-token": "valid-csrf",
      "idempotency-key": "idemp-key-1",
      "x-request-id": "req-1",
    },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/submissions/:id/working-payload route tests", () => {
  it("W1: valid payload & claimed by user -> 200", async () => {
    const rec = makeRecord("officer@phongchau.gov.vn", "UNDER_REVIEW");
    mockFindById.mockResolvedValueOnce(rec);
    mockCommitWorkingPayload.mockResolvedValueOnce({
      ...rec,
      version: 2,
      updatedAt: new Date().toISOString(),
    });

    const res = await PUT(makeRequest({ expectedVersion: 1, payload: makeDraft(), changeNote: "Test edit" }), {
      params: Promise.resolve({ submissionId: "sub_1" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.submission.version).toBe(2);
  });

  it("W2: not claimed by user -> 403 ACCESS_DENIED", async () => {
    const rec = makeRecord("other_officer@phongchau.gov.vn", "UNDER_REVIEW");
    mockFindById.mockResolvedValueOnce(rec);

    const res = await PUT(makeRequest({ expectedVersion: 1, payload: makeDraft() }), {
      params: Promise.resolve({ submissionId: "sub_1" }),
    });

    expect(res.status).toBe(403);
  });

  it("W3: version mismatch -> 409 VERSION_CONFLICT", async () => {
    const rec = makeRecord("officer@phongchau.gov.vn", "UNDER_REVIEW");
    mockFindById.mockResolvedValueOnce(rec);

    const res = await PUT(makeRequest({ expectedVersion: 5, payload: makeDraft() }), {
      params: Promise.resolve({ submissionId: "sub_1" }),
    });

    expect(res.status).toBe(409);
  });
});
