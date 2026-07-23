import { describe, expect, it } from "vitest";

import type { SubmissionRecord } from "@/modules/public-intake/repository";
import {
  isClaimedBy,
  maskPhone,
  mayClaim,
  mayReject,
  mayRequestSupplement,
} from "@/modules/submissions/review";

function record(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    submissionId: "sub_1",
    receiptCode: "PC-KK-2026-TEST",
    status: "UNDER_REVIEW",
    phone: "0966983232",
    version: 1,
    accessCodeHash: "hash",
    failedAttempts: 0,
    lockedUntil: "",
    consentVersion: "v1",
    consentedAt: "2026-07-21T00:00:00.000Z",
    retentionUntil: "",
    driveFolderId: "folder",
    officialCaseId: "",
    acceptStep: "",
    claimedBy: "officer@example.com",
    claimedAt: "2026-07-21T00:00:00.000Z",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    draft: null,
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
    ...overrides,
  };
}

describe("submission review helpers", () => {
  it("masks phone numbers outside the detail reveal flow", () => {
    expect(maskPhone("0966983232")).toBe("09••••32");
  });

  it("only allows a claimed under-review submission to request supplement or reject", () => {
    const current = record();
    expect(isClaimedBy(current, "OFFICER@example.com")).toBe(true);
    expect(mayRequestSupplement(current, "officer@example.com")).toBe(true);
    expect(mayReject(current, "other@example.com")).toBe(false);
  });

  it("allows claims only for submitted, resubmitted or currently reviewed records", () => {
    expect(mayClaim("SUBMITTED")).toBe(true);
    expect(mayClaim("RESUBMITTED")).toBe(true);
    expect(mayClaim("UNDER_REVIEW")).toBe(true);
    expect(mayClaim("ACCEPTED")).toBe(false);
  });
});
