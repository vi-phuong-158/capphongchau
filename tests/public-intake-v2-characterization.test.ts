/**
 * Characterization test — Phase 0 của `CLAUDE_IMPLEMENTATION_PLAN_PUBLIC_INTAKE_V2.md`.
 *
 * Khóa hành vi **hiện tại** trước khi Public Intake V2 nới điều kiện gửi của người dân. Hai nhóm:
 *
 * - `describe("hiện trạng ...")` — mô tả cái đang có, sẽ **đảo ngược có chủ đích** ở Phase 1.
 *   Khi Phase 1 chạy, các test này phải được cập nhật cùng commit và nêu rõ lý do.
 * - `describe("bất biến ...")` — cái phải đúng cả trước lẫn sau V2.
 *
 * Không dùng dữ liệu giấy tờ thật ở đây: mọi CCCD/số GCN là chuỗi bịa cho test.
 */
import { describe, expect, it } from "vitest";

import type { SubmissionRecord } from "@/modules/public-intake/repository";
import {
  emptyDraft,
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  type IntakeDraft,
} from "@/modules/public-intake/types";
import {
  validateCitizenSubmitDraft,
  validateDraftForSubmit,
} from "@/modules/public-intake/validation";
import type { PublicFileSummary } from "@/modules/public-intake/workflow";
import { completionChecks } from "@/modules/submissions/completion-checks";

/** Bộ ảnh đủ cho `fullDraft()`: CCCD trước/sau của owner-1 và một ảnh GCN. */
function completeFiles(): PublicFileSummary[] {
  const base = {
    status: "UPLOADED" as const,
    sizeBytes: 1024,
    checksum: "checksum",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
  return [
    { ...base, fileId: "f1", ownerId: "owner-1", documentType: "CITIZEN_ID_FRONT" },
    { ...base, fileId: "f2", ownerId: "owner-1", documentType: "CITIZEN_ID_BACK" },
    { ...base, fileId: "f3", ownerId: "", documentType: "CERTIFICATE" },
  ];
}

/** Draft đủ mọi trường PL3 mà `validateDraftForSubmit` đang đòi hỏi. */
function fullDraft(): IntakeDraft {
  const draft = emptyDraft("owner-1", "parcel-1", "use-1");
  draft.phone = "0987654321";
  draft.consentAccepted = true;
  draft.certificate = {
    issueNumber: "GCN-TEST-001",
    issueDate: "2016-03-11",
    registryNumber: "CS-TEST",
  };
  draft.owners[0] = {
    ...emptyOwner("owner-1"),
    fullName: "Nguyễn Văn Test",
    identityNumber: "012345678901",
    dateOfBirth: "1990-01-01",
    gender: "NAM",
    residenceAddress: "Phường Phong Châu, Phú Thọ",
    identitySource: "MANUAL",
    identityStatus: "MANUAL_COMPLETE",
    roleOnCertificate: "CA_NHAN",
  };
  draft.parcels[0] = {
    ...emptyParcel("parcel-1", "use-1"),
    mapSheetNumber: "5",
    parcelNumber: "10",
    addressOnCertificate: "Khu Thống Nhất, phường Phong Châu",
    oldWard: "PHONG_CHAU_CU",
    area: "220",
    landUses: [
      {
        ...emptyLandUse("use-1"),
        purposeCode: "ONT",
        originCode: "NHA_NUOC_CONG_NHAN",
        formCode: "SU_DUNG_RIENG",
        termCode: "SU_DUNG_ON_DINH_LAU_DAI",
      },
    ],
  };
  return draft;
}

/** Draft "tối thiểu" theo mục tiêu V2: chỉ phone + tên chủ + consent, còn lại để trống. */
function minimalDraft(): IntakeDraft {
  const draft = emptyDraft("owner-1", "parcel-1", "use-1");
  draft.phone = "0987654321";
  draft.consentAccepted = true;
  draft.owners[0] = { ...emptyOwner("owner-1"), fullName: "Nguyễn Văn Test" };
  return draft;
}

function recordWith(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    submissionId: "sub_test",
    receiptCode: "PC-KK-2026-0001",
    status: "UNDER_REVIEW",
    phone: "0987654321",
    version: 1,
    accessCodeHash: "hash",
    failedAttempts: 0,
    lockedUntil: "",
    consentVersion: "v1",
    consentedAt: "2026-07-28T00:00:00.000Z",
    retentionUntil: "",
    driveFolderId: "folder_test",
    officialCaseId: "",
    acceptStep: "",
    claimedBy: "officer@example.test",
    claimedByDisplayName: "",
    intakeChannel: "SELF_SERVICE" as const,
    assistedByEmail: "",
    assistedByDisplayName: "",
    assistedAt: "",
    claimedAt: "2026-07-28T00:00:00.000Z",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    draft: fullDraft(),
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
    ...overrides,
  } as SubmissionRecord;
}

function blockingCodes(record: SubmissionRecord, payload: IntakeDraft | null): string[] {
  return completionChecks(record, payload)
    .filter((check) => check.severity === "BLOCKING")
    .map((check) => check.code);
}

describe("hiện trạng: public submit đòi toàn bộ dữ liệu PL3 (sẽ nới ở Phase 1)", () => {
  it("chấp nhận draft đầy đủ", () => {
    expect(validateDraftForSubmit(fullDraft())).toBeNull();
  });

  it("từ chối draft tối thiểu — đây chính là rào cản mà V2 gỡ bỏ", () => {
    expect(validateDraftForSubmit(minimalDraft())).not.toBeNull();
  });

  it("từ chối khi thiếu số phát hành / ngày cấp / số vào sổ GCN", () => {
    for (const field of ["issueNumber", "issueDate", "registryNumber"] as const) {
      const draft = fullDraft();
      draft.certificate[field] = "";
      expect(validateDraftForSubmit(draft), field).not.toBeNull();
    }
  });

  it("từ chối khi chủ sử dụng cá nhân bỏ trống CCCD", () => {
    const draft = fullDraft();
    draft.owners[0].identityNumber = "";
    expect(validateDraftForSubmit(draft)).not.toBeNull();
  });

  it("từ chối khi thiếu đơn vị hành chính cũ của thửa", () => {
    const draft = fullDraft();
    draft.parcels[0].oldWard = "";
    expect(validateDraftForSubmit(draft)).not.toBeNull();
  });

  it("từ chối khi loại đất thiếu nguồn gốc / hình thức / thời hạn", () => {
    for (const field of ["originCode", "formCode", "termCode"] as const) {
      const draft = fullDraft();
      draft.parcels[0].landUses[0][field] = "";
      expect(validateDraftForSubmit(draft), field).not.toBeNull();
    }
  });
});

/**
 * Phase 1 đã **đảo ngược** nhóm này.
 *
 * Trước Phase 1 (commit `1cc7d93`) sáu test dưới đây khẳng định `completionChecks` **không** chặn
 * các thiếu sót này — đó là lỗ hổng §1.5: cổng công khai đòi đủ PL3 còn gác cổng tiếp nhận chính
 * thức thì không. Nới điều kiện gửi của người dân mà giữ nguyên gác cổng sẽ để hồ sơ chỉ có tên +
 * ảnh tiếp nhận chính thức được. Nay mỗi thiếu sót phải sinh đúng mã BLOCKING tương ứng.
 */
describe("sau Phase 1: completionChecks là gác cổng đầy đủ (lỗ hổng §1.5 đã vá)", () => {
  it("chặn thửa thiếu đơn vị hành chính cũ", () => {
    const draft = fullDraft();
    draft.parcels[0].oldWard = "";
    expect(blockingCodes(recordWith({ draft }), draft)).toContain("PARCEL_0_WARD_INVALID");
  });

  it("chặn chủ sử dụng thiếu vai trò trên GCN", () => {
    const draft = fullDraft();
    draft.owners[0].roleOnCertificate = "";
    expect(blockingCodes(recordWith({ draft }), draft)).toContain("OWNER_0_ROLE_MISSING");
  });

  it("chặn chủ sử dụng thiếu ngày sinh / giới tính / địa chỉ", () => {
    const draft = fullDraft();
    draft.owners[0].dateOfBirth = "";
    draft.owners[0].gender = "";
    draft.owners[0].residenceAddress = "";
    const codes = blockingCodes(recordWith({ draft }), draft);
    expect(codes).toContain("OWNER_0_DOB_MISSING");
    expect(codes).toContain("OWNER_0_GENDER_MISSING");
    expect(codes).toContain("OWNER_0_ADDRESS_MISSING");
  });

  it("chặn thửa thiếu địa chỉ ghi trên GCN", () => {
    const draft = fullDraft();
    draft.parcels[0].addressOnCertificate = "";
    expect(blockingCodes(recordWith({ draft }), draft)).toContain("PARCEL_0_ADDRESS_MISSING");
  });

  it("chặn loại đất thiếu nguồn gốc / hình thức / thời hạn", () => {
    const draft = fullDraft();
    draft.parcels[0].landUses[0] = { ...emptyLandUse("use-1"), purposeCode: "ONT" };
    const codes = blockingCodes(recordWith({ draft }), draft);
    expect(codes).toContain("PARCEL_0_USE_0_ORIGIN_MISSING");
    expect(codes).toContain("PARCEL_0_USE_0_FORM_MISSING");
    expect(codes).toContain("PARCEL_0_USE_0_TERM_MISSING");
  });

  it("chặn (không còn chỉ cảnh báo) khi hồ sơ thiếu ảnh GCN hoặc ảnh CCCD", () => {
    const draft = fullDraft();
    const codes = blockingCodes(recordWith({ draft, fileSummaries: [] }), draft);
    expect(codes).toContain("FILES_CERTIFICATE_MISSING");
    expect(codes).toContain("FILES_OWNER_0_CITIZEN_ID_FRONT_MISSING");
    expect(codes).toContain("FILES_OWNER_0_CITIZEN_ID_BACK_MISSING");
  });

  it("chặn loại đất còn ở trạng thái “đề nghị cán bộ đối chiếu”", () => {
    const draft = fullDraft();
    draft.parcels[0].landUses[0].purposeCode = "CAN_DOI_CHIEU";
    expect(blockingCodes(recordWith({ draft }), draft)).toContain(
      "PARCEL_0_USE_0_PURPOSE_UNRESOLVED",
    );
  });

  it("hồ sơ hoàn chỉnh kèm đủ ảnh thì không còn lỗi chặn nào", () => {
    const draft = fullDraft();
    expect(blockingCodes(recordWith({ draft, fileSummaries: completeFiles() }), draft)).toEqual([]);
  });

  it("chặn hồ sơ legacy thiếu consent thay vì tự backfill", () => {
    const draft = fullDraft();
    draft.consentAccepted = false;
    expect(blockingCodes(recordWith({ draft, fileSummaries: completeFiles() }), draft)).toContain(
      "CONSENT_NOT_ACCEPTED",
    );
  });

  it("chặn identity chưa xác nhận và QR override còn chờ duyệt", () => {
    const draft = fullDraft();
    draft.owners[0].identityStatus = "";
    expect(blockingCodes(recordWith({ draft, fileSummaries: completeFiles() }), draft)).toContain(
      "OWNER_0_IDENTITY_NOT_CONFIRMED",
    );
    draft.owners[0].identityStatus = "QR_OVERRIDE_PENDING_REVIEW";
    expect(blockingCodes(recordWith({ draft, fileSummaries: completeFiles() }), draft)).toContain(
      "OWNER_0_IDENTITY_OVERRIDE_PENDING",
    );
  });
});

describe("sau Phase 1: public submit chấp nhận hồ sơ tối thiểu", () => {
  it("chỉ phone + consent + tên chủ là đủ để gửi", () => {
    expect(validateCitizenSubmitDraft(minimalDraft())).toEqual([]);
  });

  it("nhưng tiếp nhận chính thức vẫn chặn chính hồ sơ đó", () => {
    const draft = minimalDraft();
    expect(
      blockingCodes(recordWith({ draft, fileSummaries: completeFiles() }), draft).length,
    ).toBeGreaterThan(0);
  });
});

describe("bất biến: phải đúng cả trước lẫn sau V2", () => {
  it("thiếu số điện thoại hợp lệ thì không gửi được", () => {
    const draft = fullDraft();
    draft.phone = "123";
    expect(validateDraftForSubmit(draft)).not.toBeNull();
  });

  it("không có dữ liệu kê khai thì tiếp nhận chính thức bị chặn", () => {
    expect(blockingCodes(recordWith({ draft: null }), null)).toContain("NO_PAYLOAD");
  });

  it("draft có trường lạ bị từ chối ở tầng cấu trúc", () => {
    const draft = { ...fullDraft(), khongPhaiTruong: 1 } as unknown as IntakeDraft;
    expect(validateDraftForSubmit(draft)).not.toBeNull();
  });

  it("quá 3 mục đích sử dụng trên một thửa bị chặn ở cả hai tầng", () => {
    const draft = fullDraft();
    const base = draft.parcels[0].landUses[0];
    draft.parcels[0].landUses = [
      base,
      { ...base, id: "use-2" },
      { ...base, id: "use-3" },
      { ...base, id: "use-4" },
    ];
    expect(validateDraftForSubmit(draft)).not.toBeNull();
    expect(blockingCodes(recordWith({ draft }), draft)).toContain("PARCEL_0_LAND_USES_EXCEEDED");
  });
});
