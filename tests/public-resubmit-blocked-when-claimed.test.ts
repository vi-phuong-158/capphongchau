import { describe, expect, it } from "vitest";

import type { SubmissionRecord } from "@/modules/public-intake/repository";
import { isEditable, isHeldByOfficer } from "@/modules/public-intake/route-context";
import { emptyOwner, type IntakeDraft } from "@/modules/public-intake/types";

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
    status: "NEEDS_SUPPLEMENT",
    phone: "0912345678",
    version: 3,
    accessCodeHash: "hash",
    failedAttempts: 0,
    lockedUntil: "",
    consentVersion: "v1",
    consentedAt: "2026-07-29T08:00:00.000Z",
    retentionUntil: "",
    driveFolderId: "folder_1",
    officialCaseId: "",
    acceptStep: "",
    claimedBy: "",
    claimedByDisplayName: "",
    intakeChannel: "SELF_SERVICE",
    assistedByEmail: "",
    assistedByDisplayName: "",
    assistedAt: "",
    claimedAt: "",
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

/**
 * Lỗ hổng gốc: `repository.submit()` xóa sạch `claimed_by`/`claimed_at` khi người dân gửi lại,
 * mà hồ sơ `NEEDS_SUPPLEMENT` cũ vẫn giữ nguyên cán bộ đã yêu cầu bổ sung. Version vẫn khớp nên
 * KHÔNG có xung đột phiên bản nào chặn — một lần bấm "Bổ sung hồ sơ" của người dân âm thầm cướp
 * hồ sơ khỏi tay cán bộ đang xử lý.
 */
describe("Đợt 2A-3 — cán bộ ưu tiên: chặn người dân ghi khi hồ sơ đang có cán bộ giữ", () => {
  it("hồ sơ NEEDS_SUPPLEMENT còn cán bộ giữ thì KHÔNG cho người dân sửa/gửi lại", () => {
    const record = makeRecord({
      status: "NEEDS_SUPPLEMENT",
      claimedBy: "officer@phongchau.gov.vn",
      claimedByDisplayName: "Cán bộ A",
      claimedAt: "2026-07-29T09:00:00.000Z",
    });

    expect(isHeldByOfficer(record)).toBe(true);
    expect(isEditable(record)).toBe(false);
  });

  it("hồ sơ NEEDS_SUPPLEMENT không còn ai giữ thì vẫn cho người dân bổ sung như cũ", () => {
    const record = makeRecord({ status: "NEEDS_SUPPLEMENT", claimedBy: "" });

    expect(isHeldByOfficer(record)).toBe(false);
    expect(isEditable(record)).toBe(true);
  });

  it("bản nháp không bị ảnh hưởng — DRAFT không bao giờ bị claim nên vẫn sửa được", () => {
    const record = makeRecord({ status: "DRAFT", claimedBy: "" });

    expect(isEditable(record)).toBe(true);
  });

  it("chuỗi rỗng có khoảng trắng vẫn tính là chưa ai giữ", () => {
    const record = makeRecord({ status: "NEEDS_SUPPLEMENT", claimedBy: "   " });

    expect(isHeldByOfficer(record)).toBe(false);
    expect(isEditable(record)).toBe(true);
  });

  it("trạng thái đã gửi vẫn bị khóa dù không ai giữ (không nới lỏng luật cũ)", () => {
    for (const status of ["SUBMITTED", "RESUBMITTED", "UNDER_REVIEW", "ACCEPTED"] as const) {
      expect(isEditable(makeRecord({ status, claimedBy: "" }))).toBe(false);
    }
  });
});
