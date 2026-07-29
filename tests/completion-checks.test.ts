import { describe, expect, it } from "vitest";
import {
  blockingCompletionIssueDetails,
  completionChecks,
} from "@/modules/submissions/completion-checks";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import {
  emptyAsset,
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  type IntakeDraft,
} from "@/modules/public-intake/types";
import type { PublicFileSummary } from "@/modules/public-intake/workflow";

/**
 * Từ Public Intake V2, `completionChecks` là gác cổng **đầy đủ** cho tiếp nhận chính thức: bản
 * kê khai "hợp lệ" phải đủ cả `oldWard`, nguồn gốc/hình thức/thời hạn và bộ ảnh CCCD + GCN.
 * Fixture này được bổ sung cho khớp, không phải nới lỏng kiểm tra.
 */
function makeDraft(overrides: Partial<IntakeDraft> = {}): IntakeDraft {
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
        identityStatus: "MANUAL_COMPLETE",
      },
    ],
    parcels: [
      {
        ...emptyParcel("p1", "l1"),
        parcelNumber: "10",
        mapSheetNumber: "5",
        area: "100",
        addressOnCertificate: "Phong Châu",
        oldWard: "PHONG_CHAU_CU",
        landUses: [
          {
            ...emptyLandUse("l1"),
            purposeCode: "ODT",
            originCode: "NHA_NUOC_CONG_NHAN",
            formCode: "SU_DUNG_RIENG",
            termCode: "SU_DUNG_ON_DINH_LAU_DAI",
            area: "100",
          },
        ],
      },
    ],
    assets: [],
    phone: "0912345678",
    consentAccepted: true,
    ...overrides,
  };
}

function makeFiles(): PublicFileSummary[] {
  const base = {
    status: "UPLOADED" as const,
    sizeBytes: 1024,
    checksum: "checksum",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
  return [
    { ...base, fileId: "f1", ownerId: "o1", documentType: "CITIZEN_ID_FRONT" },
    { ...base, fileId: "f2", ownerId: "o1", documentType: "CITIZEN_ID_BACK" },
    { ...base, fileId: "f3", ownerId: "", documentType: "CERTIFICATE" },
  ];
}

function makeRecord(): SubmissionRecord {
  return {
    submissionId: "sub_1",
    receiptCode: "PC-KK-2026-0001",
    status: "UNDER_REVIEW",
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
    claimedBy: "officer@phongchau.gov.vn",
    claimedByDisplayName: "",
    intakeChannel: "SELF_SERVICE" as const,
    assistedByEmail: "",
    assistedByDisplayName: "",
    assistedAt: "",
    claimedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draft: makeDraft(),
    accessVersion: 1,
    fileSummaries: makeFiles(),
    rowIndex: 1,
  };
}

describe("Completion checks validation rules", () => {
  it("CC1: valid draft -> zero BLOCKING issues", () => {
    const rec = makeRecord();
    const checks = completionChecks(rec, makeDraft());
    const blocking = checks.filter((c) => c.severity === "BLOCKING");
    expect(blocking.length).toBe(0);
  });

  it("CC2: missing issue number -> BLOCKING issue CERT_ISSUE_NUMBER_MISSING", () => {
    const rec = makeRecord();
    const draft = makeDraft({
      certificate: { issueNumber: "", issueDate: "2020-01-01", registryNumber: "CH001" },
    });
    const checks = completionChecks(rec, draft);
    expect(checks.some((c) => c.code === "CERT_ISSUE_NUMBER_MISSING")).toBe(true);
  });

  it("CC2a: exposes safe, actionable details for every blocking issue", () => {
    const rec = makeRecord();
    const draft = makeDraft({
      certificate: { issueNumber: "", issueDate: "2020-01-01", registryNumber: "CH001" },
    });

    expect(blockingCompletionIssueDetails(completionChecks(rec, draft))).toContainEqual({
      code: "CERT_ISSUE_NUMBER_MISSING",
      label: "Thiếu số phát hành GCN",
      message: "Chưa nhập số phát hành Giấy chứng nhận.",
    });
  });

  it("CC3: invalid citizen ID -> BLOCKING issue OWNER_0_ID_INVALID", () => {
    const rec = makeRecord();
    const draft = makeDraft({
      owners: [
        {
          ...emptyOwner("o1"),
          fullName: "Nguyễn Văn A",
          identityNumber: "1234", // invalid
          ownerType: "CA_NHAN",
        },
      ],
    });
    const checks = completionChecks(rec, draft);
    expect(checks.some((c) => c.code === "OWNER_0_ID_INVALID")).toBe(true);
  });

  it("CC4: 4 land uses on 1 parcel -> BLOCKING issue PARCEL_0_LAND_USES_EXCEEDED", () => {
    const rec = makeRecord();
    const draft = makeDraft({
      parcels: [
        {
          ...emptyParcel("p1", "l1"),
          parcelNumber: "10",
          area: "100",
          landUses: [
            emptyLandUse("l1"),
            emptyLandUse("l2"),
            emptyLandUse("l3"),
            emptyLandUse("l4"),
          ],
        },
      ],
    });
    const checks = completionChecks(rec, draft);
    expect(checks.some((c) => c.code === "PARCEL_0_LAND_USES_EXCEEDED")).toBe(true);
  });

  it("CC-ASSET: tài sản chưa chọn thửa bị chặn, thông báo chỉ rõ tài sản nào", () => {
    const rec = makeRecord();
    const draft = makeDraft({
      assets: [
        { ...emptyAsset("a1", "p1"), assetType: "NHA_O" },
        // Tài sản mồ côi sau khi cán bộ xóa thửa — lưu được, nhưng không tiếp nhận được.
        { ...emptyAsset("a2", ""), assetType: "CONG_TRINH", description: "Nhà kho sau vườn" },
      ],
    });

    const detail = blockingCompletionIssueDetails(completionChecks(rec, draft)).find(
      (issue) => issue.code === "ASSET_1_PARCEL_INVALID",
    );
    expect(detail).toBeDefined();
    // Phải gọi tên đúng tài sản thứ 2, không phải một câu chung chung.
    expect(detail?.label).toBe("Tài sản 2 (Công trình xây dựng khác — Nhà kho sau vườn) chưa chọn thửa đất");
    expect(detail?.message).toContain("Thửa đất liên quan");
    // Tài sản đã gắn thửa không bị báo.
    expect(
      completionChecks(rec, draft).some((check) => check.code === "ASSET_0_PARCEL_INVALID"),
    ).toBe(false);
  });

  it("CC-PII: lý do ghi đè chứa CCCD bị chặn tiếp nhận", () => {
    const rec = makeRecord();
    const draft = makeDraft({
      wardAdministrativeCodeOverride: "07999",
      wardAdministrativeCodeOverrideReason: "Theo hồ sơ của ông A 012345678901 đã nộp",
    });

    const detail = blockingCompletionIssueDetails(completionChecks(rec, draft)).find(
      (issue) => issue.code === "OVERRIDE_REASON_CONTAINS_CITIZEN_ID",
    );
    expect(detail).toBeDefined();
    // Thông báo trả ra màn hình cán bộ không được chép lại chính số CCCD.
    expect(JSON.stringify(detail)).not.toContain("012345678901");
  });
});
