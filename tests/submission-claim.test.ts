import { describe, expect, it } from "vitest";
import { mayClaim, mayForceClaim, mayRelease, mayTransfer } from "@/modules/submissions/review";
import { UserRole } from "@/modules/common/domain";
import type { PublicStatus, SubmissionRecord } from "@/modules/public-intake/repository";

function makeRecord(claimedBy: string, status: PublicStatus = "UNDER_REVIEW"): SubmissionRecord {
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
    claimedByDisplayName: claimedBy ? "Cán bộ Test" : "",
    intakeChannel: "SELF_SERVICE" as const,
    assistedByEmail: "",
    assistedByDisplayName: "",
    assistedAt: "",
    claimedAt: claimedBy ? new Date().toISOString() : "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draft: null,
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
    internalNotes: "",
  };
}

describe("Submission claim permissions and status rules", () => {
  it("C1: mayClaim returns true ONLY for SUBMITTED, RESUBMITTED and NEEDS_SUPPLEMENT", () => {
    expect(mayClaim("SUBMITTED")).toBe(true);
    expect(mayClaim("RESUBMITTED")).toBe(true);
    // Hồ sơ cũ của luồng yêu cầu bổ sung đã bỏ — phải tiếp nhận được, nếu không sẽ kẹt vĩnh viễn
    // vì người dân cũng đã bị chặn gửi lại (2026-07-29, Đợt 2A-3).
    expect(mayClaim("NEEDS_SUPPLEMENT")).toBe(true);
    expect(mayClaim("UNDER_REVIEW")).toBe(false);
    expect(mayClaim("ACCEPTED")).toBe(false);
    expect(mayClaim("REJECTED")).toBe(false);
    expect(mayClaim("DRAFT")).toBe(false);
  });

  it("C2: mayForceClaim returns true ONLY for WARD_ADMIN or SYSTEM_ADMIN", () => {
    expect(mayForceClaim([UserRole.WARD_ADMIN])).toBe(true);
    expect(mayForceClaim([UserRole.SYSTEM_ADMIN])).toBe(true);
    expect(mayForceClaim([UserRole.REVIEW_OFFICER])).toBe(false);
    expect(mayForceClaim([UserRole.INTAKE_OFFICER])).toBe(false);
  });

  it("C3: mayRelease allows current assignee OR admin", () => {
    const rec = makeRecord("officer_a@phongchau.gov.vn");

    // Current assignee
    expect(mayRelease(rec, "officer_a@phongchau.gov.vn", [UserRole.REVIEW_OFFICER])).toBe(true);
    // Other officer (not admin)
    expect(mayRelease(rec, "officer_b@phongchau.gov.vn", [UserRole.REVIEW_OFFICER])).toBe(false);
    // Admin (not assignee)
    expect(mayRelease(rec, "admin@phongchau.gov.vn", [UserRole.WARD_ADMIN])).toBe(true);
  });

  it("C4: mayTransfer allows current assignee OR admin", () => {
    const rec = makeRecord("officer_a@phongchau.gov.vn");

    expect(mayTransfer(rec, "officer_a@phongchau.gov.vn", [UserRole.REVIEW_OFFICER])).toBe(true);
    expect(mayTransfer(rec, "officer_b@phongchau.gov.vn", [UserRole.REVIEW_OFFICER])).toBe(false);
    expect(mayTransfer(rec, "admin@phongchau.gov.vn", [UserRole.SYSTEM_ADMIN])).toBe(true);
  });
});
