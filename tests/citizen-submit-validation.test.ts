/**
 * Ma trận test §6 của `CLAUDE_IMPLEMENTATION_PLAN_PUBLIC_INTAKE_V2.md` — hai tầng kiểm tra phải
 * cho kết quả **khác nhau** trên cùng một hồ sơ:
 *
 *   MỨC A `validateCitizenSubmitDraft` — người dân gửi được.
 *   MỨC C `completionChecks`           — cán bộ tiếp nhận chính thức được.
 *
 * Nới mức A mà không siết mức C là lỗ hổng nghiệp vụ; các test dưới đây khóa cả hai chiều.
 * Mọi CCCD/số GCN trong file là chuỗi bịa cho test.
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
  citizenIdsForLookup,
  normalizeLandPurposeFreeText,
  validateCitizenRequiredFiles,
  validateCitizenSubmitDraft,
} from "@/modules/public-intake/validation";
import type { PublicFileSummary } from "@/modules/public-intake/workflow";
import { completionChecks } from "@/modules/submissions/completion-checks";

function codesOf(draft: IntakeDraft): string[] {
  return validateCitizenSubmitDraft(draft).map((issue) => issue.code);
}

/** Hồ sơ tối thiểu theo mục tiêu V2: phone + đồng ý + tên chủ, mọi trường khác trống. */
function minimal(): IntakeDraft {
  const draft = emptyDraft("owner-1", "parcel-1", "use-1");
  draft.phone = "0987654321";
  draft.consentAccepted = true;
  draft.owners[0] = { ...emptyOwner("owner-1"), fullName: "Nguyễn Văn Test" };
  return draft;
}

/** Hồ sơ đủ mọi trường PL3 — dùng cho các ca "đầy đủ thì cả hai tầng đều qua". */
function complete(): IntakeDraft {
  const draft = minimal();
  draft.certificate = {
    issueNumber: "GCN-TEST-001",
    issueDate: "2016-03-11",
    registryNumber: "CS-TEST",
  };
  draft.owners[0] = {
    ...draft.owners[0],
    identityNumber: "012345678901",
    dateOfBirth: "1990-01-01",
    gender: "NAM",
    residenceAddress: "Phường Phong Châu, Phú Thọ",
    roleOnCertificate: "CA_NHAN",
    identityStatus: "MANUAL_COMPLETE",
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

function files(kinds: readonly (readonly [string, string])[]): PublicFileSummary[] {
  const base = {
    status: "UPLOADED" as const,
    sizeBytes: 1024,
    checksum: "checksum",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
  return kinds.map(([ownerId, documentType], index) => ({
    ...base,
    fileId: `f${index}`,
    ownerId,
    documentType: documentType as PublicFileSummary["documentType"],
  }));
}

const ALL_FILES = files([
  ["owner-1", "CITIZEN_ID_FRONT"],
  ["owner-1", "CITIZEN_ID_BACK"],
  ["", "CERTIFICATE"],
]);

function recordWith(draft: IntakeDraft, fileSummaries: PublicFileSummary[]): SubmissionRecord {
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
    draft,
    accessVersion: 1,
    fileSummaries,
    rowIndex: 1,
    internalNotes: "",
  } as SubmissionRecord;
}

function officialBlocks(draft: IntakeDraft, fileSummaries = ALL_FILES): boolean {
  return completionChecks(recordWith(draft, fileSummaries), draft).some(
    (check) => check.severity === "BLOCKING",
  );
}

describe("MỨC A — điều kiện tối thiểu để người dân gửi", () => {
  it("chỉ phone + đồng ý + tên chủ là đủ", () => {
    expect(validateCitizenSubmitDraft(minimal())).toEqual([]);
  });

  it("thiếu số điện thoại hợp lệ thì chặn, kèm fieldPath", () => {
    const draft = minimal();
    draft.phone = "123";
    const issues = validateCitizenSubmitDraft(draft);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "PHONE_INVALID",
      fieldPath: "phone",
      severity: "BLOCKING",
    });
  });

  it("chưa đồng ý thì chặn", () => {
    const draft = minimal();
    draft.consentAccepted = false;
    expect(codesOf(draft)).toEqual(["CONSENT_REQUIRED"]);
  });

  it("thiếu tên chủ sử dụng thì chặn đúng owner", () => {
    const draft = minimal();
    draft.owners[0].fullName = "  ";
    const issues = validateCitizenSubmitDraft(draft);
    expect(issues[0].code).toBe("OWNER_NAME_REQUIRED");
    expect(issues[0].fieldPath).toBe("owners.0.fullName");
  });

  it("không có chủ sử dụng nào thì chặn", () => {
    const draft = minimal();
    draft.owners = [];
    expect(codesOf(draft)).toContain("OWNER_REQUIRED");
  });
});

describe("MỨC A — trường tùy chọn: trống thì qua, nhập sai thì chặn", () => {
  it("bỏ trống toàn bộ thông tin GCN vẫn gửi được", () => {
    const draft = minimal();
    draft.certificate = { issueNumber: "", issueDate: "", registryNumber: "" };
    expect(validateCitizenSubmitDraft(draft)).toEqual([]);
  });

  it("bỏ trống số tờ / số thửa / diện tích / tổ dân phố vẫn gửi được", () => {
    const draft = minimal();
    draft.parcels[0] = { ...emptyParcel("parcel-1", "use-1") };
    expect(validateCitizenSubmitDraft(draft)).toEqual([]);
  });

  it("CCCD trống thì qua, nhưng 11 số thì chặn", () => {
    const empty = minimal();
    expect(validateCitizenSubmitDraft(empty)).toEqual([]);

    const wrong = minimal();
    wrong.owners[0].identityNumber = "01234567890";
    expect(codesOf(wrong)).toEqual(["OWNER_ID_INVALID"]);
  });

  it("ngày cấp GCN sai định dạng thì chặn", () => {
    const draft = minimal();
    draft.certificate.issueDate = "2016-02-31";
    expect(codesOf(draft)).toEqual(["CERTIFICATE_ISSUE_DATE_INVALID"]);
  });

  it("ngày sinh sai thì chặn", () => {
    const draft = minimal();
    draft.owners[0].dateOfBirth = "1990-13-01";
    expect(codesOf(draft)).toEqual(["OWNER_DOB_INVALID"]);
  });

  it("diện tích kiểu Việt Nam (dấu phẩy) được chấp nhận", () => {
    const draft = minimal();
    draft.parcels[0].area = "29,16";
    expect(validateCitizenSubmitDraft(draft)).toEqual([]);
  });

  it("diện tích không phải số thì chặn", () => {
    const draft = minimal();
    draft.parcels[0].area = "khoảng 200";
    expect(codesOf(draft)).toEqual(["PARCEL_AREA_INVALID"]);
  });

  it("đơn vị hành chính cũ ngoài danh mục thì chặn", () => {
    const draft = minimal();
    draft.parcels[0].oldWard = "XA_LA";
    expect(codesOf(draft)).toEqual(["PARCEL_OLD_WARD_INVALID"]);
  });

  it("tổng diện tích mục đích vượt diện tích thửa thì chặn", () => {
    const draft = minimal();
    draft.parcels[0].area = "100";
    draft.parcels[0].landUses = [{ ...emptyLandUse("use-1"), area: "150" }];
    expect(codesOf(draft)).toContain("LAND_USE_AREA_EXCEEDS_PARCEL");
  });

  it("quá 3 dòng mục đích trên một thửa thì chặn", () => {
    const draft = minimal();
    draft.parcels[0].landUses = ["a", "b", "c", "d"].map((id) => emptyLandUse(id));
    expect(codesOf(draft)).toContain("PARCEL_LAND_USES_EXCEEDED");
  });

  it("ký hiệu loại đất tự do quá dài thì chặn", () => {
    const draft = minimal();
    draft.parcels[0].landUses[0].purposeFreeText = "x".repeat(200);
    expect(codesOf(draft)).toContain("LAND_USE_FREE_TEXT_TOO_LONG");
  });

  it("draft có trường lạ bị chặn ở tầng cấu trúc", () => {
    const draft = { ...minimal(), truongLa: 1 } as unknown as IntakeDraft;
    expect(codesOf(draft)).toEqual(["DRAFT_STRUCTURE_INVALID"]);
  });
});

describe("MỨC A phần tài liệu — kiểm trên file máy chủ", () => {
  it("đủ CCCD trước/sau và một ảnh GCN thì qua", () => {
    expect(validateCitizenRequiredFiles(minimal(), ALL_FILES)).toEqual([]);
  });

  it("thiếu mặt sau thì báo đúng một lỗi có fieldPath", () => {
    const issues = validateCitizenRequiredFiles(
      minimal(),
      files([
        ["owner-1", "CITIZEN_ID_FRONT"],
        ["", "CERTIFICATE"],
      ]),
    );
    expect(issues.map((item) => item.code)).toEqual(["CITIZEN_ID_BACK_REQUIRED"]);
    expect(issues[0].fieldPath).toBe("files.owners.0.CITIZEN_ID_BACK");
  });

  it("thiếu ảnh GCN thì chặn", () => {
    const issues = validateCitizenRequiredFiles(
      minimal(),
      files([
        ["owner-1", "CITIZEN_ID_FRONT"],
        ["owner-1", "CITIZEN_ID_BACK"],
      ]),
    );
    expect(issues.map((item) => item.code)).toEqual(["CERTIFICATE_IMAGE_REQUIRED"]);
  });

  it("file đã bị thay thế / xóa không tính là bằng chứng", () => {
    const stale = ALL_FILES.map((file) => ({ ...file, status: "REPLACED" as const }));
    expect(validateCitizenRequiredFiles(minimal(), stale).map((item) => item.code)).toEqual([
      "CITIZEN_ID_FRONT_REQUIRED",
      "CITIZEN_ID_BACK_REQUIRED",
      "CERTIFICATE_IMAGE_REQUIRED",
    ]);
  });

  it("chủ sử dụng là tổ chức thì không đòi ảnh CCCD", () => {
    const draft = minimal();
    draft.owners[0].ownerType = "TO_CHUC";
    expect(
      validateCitizenRequiredFiles(draft, files([["", "CERTIFICATE"]])).map((item) => item.code),
    ).toEqual([]);
  });

  it("người trên GCN đã sang tên thì không đòi ảnh CCCD của họ", () => {
    const draft = minimal();
    draft.owners[0].hasDistinctCurrentUser = true;
    expect(
      validateCitizenRequiredFiles(draft, files([["", "CERTIFICATE"]])).map((item) => item.code),
    ).toEqual([]);
  });
});

describe("HMAC tra cứu — không bao giờ băm chuỗi rỗng", () => {
  it("hồ sơ không nhập CCCD không sinh khóa tra cứu nào", () => {
    expect(citizenIdsForLookup(minimal())).toEqual([]);
  });

  it("hai hồ sơ cùng bỏ trống CCCD không đụng nhau vì cả hai đều rỗng danh sách", () => {
    expect(citizenIdsForLookup(minimal())).toEqual(citizenIdsForLookup(minimal()));
    expect(citizenIdsForLookup(minimal())).toHaveLength(0);
  });

  it("CCCD hợp lệ vẫn sinh khóa tra cứu", () => {
    expect(citizenIdsForLookup(complete())).toEqual(["012345678901"]);
  });

  it("CCCD sai định dạng không sinh khóa (đã bị chặn ở validate, đây là lớp phòng thủ thứ hai)", () => {
    const draft = minimal();
    draft.owners[0].identityNumber = "abc";
    expect(citizenIdsForLookup(draft)).toEqual([]);
  });

  it("tổ chức không sinh khóa tra cứu CCCD", () => {
    const draft = complete();
    draft.owners[0].ownerType = "TO_CHUC";
    draft.owners[0].identityNumber = "0123456789";
    expect(citizenIdsForLookup(draft)).toEqual([]);
  });
});

describe("Ma trận §6 — mức A qua nhưng mức C chặn", () => {
  const rows: Array<[string, IntakeDraft, boolean, boolean]> = (() => {
    const rawLandUse = minimal();
    rawLandUse.parcels[0].landUses[0] = {
      ...emptyLandUse("use-1"),
      purposeCode: "GHI_THEO_BIA",
      purposeFreeText: "LUC",
    };

    const noCertFields = complete();
    noCertFields.certificate = { issueNumber: "", issueDate: "", registryNumber: "" };

    const noParcelNumbers = complete();
    noParcelNumbers.parcels[0].mapSheetNumber = "";
    noParcelNumbers.parcels[0].parcelNumber = "";

    const noCitizenIdText = complete();
    noCitizenIdText.owners[0].identityNumber = "";

    return [
      ["chỉ phone + tên + đủ ảnh", minimal(), true, true],
      ["GCN fields trống", noCertFields, true, true],
      ["loại đất chỉ ghi raw LUC", rawLandUse, true, true],
      ["CCCD text trống nhưng đủ ảnh", noCitizenIdText, true, true],
      ["số tờ/số thửa trống", noParcelNumbers, true, false],
      ["đầy đủ PL3", complete(), true, false],
    ];
  })();

  for (const [name, draft, citizenPasses, officialBlocked] of rows) {
    it(`${name}: người dân ${citizenPasses ? "gửi được" : "bị chặn"}, tiếp nhận chính thức ${officialBlocked ? "chặn" : "qua"}`, () => {
      expect(validateCitizenSubmitDraft(draft).length === 0).toBe(citizenPasses);
      expect(officialBlocks(draft)).toBe(officialBlocked);
    });
  }

  it("thiếu CCCD mặt sau: chặn ở cả hai tầng", () => {
    const draft = complete();
    const partial = files([
      ["owner-1", "CITIZEN_ID_FRONT"],
      ["", "CERTIFICATE"],
    ]);
    expect(validateCitizenRequiredFiles(draft, partial).length).toBeGreaterThan(0);
    expect(officialBlocks(draft, partial)).toBe(true);
  });

  it("CCCD nhập sai 11 số: chặn ở cả hai tầng", () => {
    const draft = complete();
    draft.owners[0].identityNumber = "01234567890";
    expect(validateCitizenSubmitDraft(draft).length).toBeGreaterThan(0);
    expect(officialBlocks(draft)).toBe(true);
  });

  it("tài sản trống không chặn tầng nào — tài sản là “nếu có”", () => {
    const draft = complete();
    draft.assets = [];
    expect(validateCitizenSubmitDraft(draft)).toEqual([]);
    expect(officialBlocks(draft)).toBe(false);
  });
});

describe("normalizeLandPurposeFreeText — giữ nguyên chữ người dân ghi trên bìa", () => {
  it("viết hoa mã ngắn thuần chữ cái", () => {
    expect(normalizeLandPurposeFreeText(" luc ")).toBe("LUC");
    expect(normalizeLandPurposeFreeText("bhk")).toBe("BHK");
  });

  it("không viết hoa cả câu tiếng Việt", () => {
    expect(normalizeLandPurposeFreeText("  đất vườn  ")).toBe("đất vườn");
  });

  it("cắt theo giới hạn độ dài", () => {
    expect(normalizeLandPurposeFreeText("x".repeat(500))).toHaveLength(120);
  });

  it("chuỗi rỗng vẫn là rỗng", () => {
    expect(normalizeLandPurposeFreeText("   ")).toBe("");
  });
});
