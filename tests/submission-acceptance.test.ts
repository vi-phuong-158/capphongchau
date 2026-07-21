import { describe, expect, it } from "vitest";

import {
  canStartOfficialAcceptance,
  formatOfficialCaseId,
  vietnamBusinessYear,
} from "@/modules/submissions/acceptance";
import type { SubmissionRecord } from "@/modules/public-intake/repository";

function record(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    submissionId: "sub_1",
    receiptCode: "PC-KK-2026-TEST",
    status: "UNDER_REVIEW",
    phone: "0966983232",
    version: 2,
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
    rowIndex: 1,
    ...overrides,
  };
}

describe("official acceptance guards", () => {
  it("only lets the claimant or an administrator start acceptance", () => {
    expect(canStartOfficialAcceptance(record(), "officer@example.com", false)).toBe(true);
    expect(canStartOfficialAcceptance(record(), "other@example.com", false)).toBe(false);
    expect(canStartOfficialAcceptance(record(), "other@example.com", true)).toBe(true);
    expect(
      canStartOfficialAcceptance(
        record({ officialCaseId: "PHONGCHAU-2026-000001" }),
        "officer@example.com",
        true,
      ),
    ).toBe(false);
  });

  it("builds stable case IDs and uses Vietnam's business year", () => {
    expect(formatOfficialCaseId("2026", 9)).toBe("PHONGCHAU-2026-000009");
    expect(vietnamBusinessYear(new Date("2026-12-31T18:00:00.000Z"))).toBe("2027");
  });
});
