import { describe, expect, it } from "vitest";

import {
  canStartOfficialAcceptance,
  formatOfficialCaseId,
  OFFICIAL_ACCEPTANCE_ENABLED,
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
    claimedByDisplayName: "",
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

  // Trip-wire hai chiều. Cờ được chủ dự án mở ngày 2026-07-25 (03-decisions.md [2026-07-25] "Mở
  // tiếp nhận chính thức") sau khi đóng hết điều kiện gác cổng và vá 2 lỗi chặn. Đóng lại là công
  // tắc dừng khẩn hợp lệ — nhưng phải là quyết định có ghi chép, không phải một lần sửa lướt qua.
  it("keeps the official acceptance flag ON — flipping it back is an emergency stop that must be a recorded decision, never a silent edit", () => {
    expect(OFFICIAL_ACCEPTANCE_ENABLED).toBe(true);
  });
});
