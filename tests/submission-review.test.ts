import { describe, expect, it } from "vitest";

import type { SubmissionRecord } from "@/modules/public-intake/repository";
import {
  isClaimedBy,
  isOwnerIdentityQrConfirmed,
  maskPhone,
  mayAmendOfficialRecord,
  mayClaim,
  mayReject,
  mayRequestSupplement,
  mayStaffEdit,
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

  it("only lets the claimant edit an under-review draft", () => {
    const current = record();
    expect(mayStaffEdit(current, "officer@example.com")).toBe(true);
    expect(mayStaffEdit(current, "other@example.com")).toBe(false);
    expect(mayStaffEdit(record({ status: "SUBMITTED" }), "officer@example.com")).toBe(false);
  });

  describe("mayAmendOfficialRecord — điều chỉnh hồ sơ đã tiếp nhận (Q2, 2026-07-25)", () => {
    const accepted = () =>
      record({ status: "ACCEPTED", officialCaseId: "PHONGCHAU-2026-000001" });

    it("cho phép cán bộ đã nhận hồ sơ, và cho phép cả quản trị viên", () => {
      expect(mayAmendOfficialRecord(accepted(), "officer@example.com", false)).toBe(true);
      // Quản trị viên phải điều chỉnh được kể cả khi cán bộ nhận hồ sơ đã nghỉ/chuyển việc.
      expect(mayAmendOfficialRecord(accepted(), "admin@example.com", true)).toBe(true);
    });

    it("từ chối cán bộ khác không phải người nhận hồ sơ", () => {
      expect(mayAmendOfficialRecord(accepted(), "other@example.com", false)).toBe(false);
    });

    it("chỉ áp dụng cho hồ sơ ĐÃ tiếp nhận — trạng thái khác đi đường sửa thường", () => {
      for (const status of ["UNDER_REVIEW", "SUBMITTED", "ACCEPTING", "REJECTED"] as const) {
        expect(
          mayAmendOfficialRecord(
            record({ status, officialCaseId: "PHONGCHAU-2026-000001" }),
            "officer@example.com",
            true,
          ),
        ).toBe(false);
      }
    });

    it("từ chối khi chưa có mã hồ sơ chính thức — không có case_id thì không có gì để đồng bộ lại", () => {
      expect(
        mayAmendOfficialRecord(
          record({ status: "ACCEPTED", officialCaseId: "   " }),
          "officer@example.com",
          true,
        ),
      ).toBe(false);
    });

    it("không giao nhau với mayStaffEdit — một hồ sơ không bao giờ đi được cả hai đường", () => {
      const cases = [
        record({ status: "UNDER_REVIEW" }),
        accepted(),
        record({ status: "SUBMITTED" }),
      ];
      for (const current of cases) {
        const amend = mayAmendOfficialRecord(current, "officer@example.com", true);
        const edit = mayStaffEdit(current, "officer@example.com");
        expect(amend && edit).toBe(false);
      }
    });
  });

  // Từ 2026-07-25 đây là cờ CẢNH BÁO (cán bộ vẫn sửa được, mỗi lần ghi đè có dấu vết audit),
  // không còn là khóa cứng — xem 03-decisions.md [2026-07-25] Q1.
  it("flags owner identity as chip-read only once QR-confirmed", () => {
    expect(isOwnerIdentityQrConfirmed("QR_CONFIRMED")).toBe(true);
    expect(isOwnerIdentityQrConfirmed("MANUAL")).toBe(false);
    expect(isOwnerIdentityQrConfirmed("PENDING_CONFIRMATION")).toBe(false);
    expect(isOwnerIdentityQrConfirmed("")).toBe(false);
  });
});
