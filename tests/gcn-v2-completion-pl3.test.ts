import { describe, expect, it } from "vitest";

import { buildSubmissionRows, PL3_DATA_COLUMN_COUNT } from "@/modules/public-intake/pl3-export";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import {
  emptyAsset,
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  type IntakeDraft,
} from "@/modules/public-intake/types";
import type { PublicFileSummary } from "@/modules/public-intake/workflow";
import { completionChecks } from "@/modules/submissions/completion-checks";

function syntheticDraft(parcelCount = 18): IntakeDraft {
  const owners = [
    {
      ...emptyOwner("owner_synthetic_1"),
      fullName: "Chủ tổng hợp Một",
      identityNumber: "000000000001",
      dateOfBirth: "1980-01-01",
      gender: "NAM" as const,
      residenceAddress: "Địa chỉ kiểm thử Một",
      roleOnCertificate: "CA_NHAN",
      identityStatus: "MANUAL_COMPLETE" as const,
    },
    {
      ...emptyOwner("owner_synthetic_2"),
      ownerType: "DONG_SU_DUNG" as const,
      fullName: "Chủ tổng hợp Hai",
      identityNumber: "000000000002",
      dateOfBirth: "1982-02-02",
      gender: "NU" as const,
      residenceAddress: "Địa chỉ kiểm thử Hai",
      roleOnCertificate: "THANH_VIEN",
      identityStatus: "MANUAL_COMPLETE" as const,
    },
  ];
  const parcels = Array.from({ length: parcelCount }, (_, index) => {
    const ordinal = String(index + 1).padStart(3, "0");
    return {
      ...emptyParcel(`parcel_synthetic_${ordinal}`, `landuse_${ordinal}_1`),
      parcelIdCode: `SYN-${ordinal}`,
      mapSheetNumber: "01",
      parcelNumber: ordinal,
      addressOnCertificate: `Địa chỉ thửa tổng hợp ${ordinal}`,
      oldWard: "PHONG_CHAU_CU",
      area: "300",
      landUses: [
        {
          ...emptyLandUse(`landuse_${ordinal}_1`),
          purposeCode: "ODT",
          area: "100",
          originCode: "NHA_NUOC_CONG_NHAN",
          formCode: "SU_DUNG_RIENG",
          termCode: "SU_DUNG_ON_DINH_LAU_DAI",
        },
        {
          ...emptyLandUse(`landuse_${ordinal}_2`),
          purposeCode: "CLN",
          area: "100",
          originCode: "NHAN_CHUYEN_QUYEN",
          formCode: "SU_DUNG_CHUNG",
          termCode: "SU_DUNG_CO_THOI_HAN",
        },
        {
          ...emptyLandUse(`landuse_${ordinal}_3`),
          purposeCode: "HNK",
          area: "100",
          originCode: "THUA_KE_TANG_CHO",
          formCode: "SU_DUNG_RIENG_VA_CHUNG",
          termCode: "SU_DUNG_CO_THOI_HAN",
        },
      ],
    };
  });
  return {
    certificate: {
      issueNumber: "SYN 000001",
      issueDate: "2026-08-03",
      registryNumber: "SYN-REG-001",
    },
    owners,
    parcels,
    assets: [
      {
        ...emptyAsset("asset_synthetic_1", parcels[0].id),
        assetType: "NHA_O",
        description: "Nhà kiểm thử tổng hợp",
        constructionArea: "80",
        floorArea: "160",
        ownershipForm: "Sở hữu riêng",
        ownershipTerm: "Lâu dài",
        grade: "Cấp 3",
      },
    ],
    phone: "0900000000",
    consentAccepted: true,
  };
}

function fileSummaries(): PublicFileSummary[] {
  const common = {
    status: "UPLOADED" as const,
    sizeBytes: 1_024,
    checksum: "synthetic-checksum",
    mimeType: "image/jpeg",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
  return [
    {
      ...common,
      fileId: "file_gcn_synthetic",
      ownerId: "",
      documentType: "CERTIFICATE",
    },
    ...["owner_synthetic_1", "owner_synthetic_2"].flatMap((ownerId, index) => [
      {
        ...common,
        fileId: `file_front_${index}`,
        ownerId,
        documentType: "CITIZEN_ID_FRONT" as const,
      },
      {
        ...common,
        fileId: `file_back_${index}`,
        ownerId,
        documentType: "CITIZEN_ID_BACK" as const,
      },
    ]),
  ];
}

function record(draft: IntakeDraft): SubmissionRecord {
  return {
    submissionId: "submission_synthetic_gcn_v2",
    receiptCode: "PC-SYN-000001",
    status: "UNDER_REVIEW",
    phone: draft.phone,
    version: 7,
    accessCodeHash: "synthetic-hash",
    failedAttempts: 0,
    lockedUntil: "",
    consentVersion: "synthetic-v1",
    consentedAt: "2026-08-03T00:00:00.000Z",
    retentionUntil: "",
    driveFolderId: "synthetic-folder",
    officialCaseId: "",
    acceptStep: "",
    claimedBy: "officer@example.invalid",
    claimedByDisplayName: "Cán bộ kiểm thử",
    intakeChannel: "SELF_SERVICE",
    assistedByEmail: "",
    assistedByDisplayName: "",
    assistedAt: "",
    claimedAt: "2026-08-03T00:00:00.000Z",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    draft,
    citizenPayload: null,
    citizenPayloadVersion: 1,
    citizenPayloadAt: "2026-08-03T00:00:00.000Z",
    workingPayload: draft,
    workingPayloadAt: "2026-08-03T00:00:00.000Z",
    workingPayloadBy: "officer@example.invalid",
    officialPayload: null,
    officialPayloadAt: "",
    officialPayloadBy: "",
    accessVersion: 1,
    fileSummaries: fileSummaries(),
    rowIndex: 1,
    internalNotes: "",
  };
}

describe("GCN v2 → completionChecks → PL3", () => {
  it("chấp nhận payload tổng hợp 2 chủ, 18 thửa, 3 mục đích và tài sản", () => {
    const draft = syntheticDraft();
    const blocking = completionChecks(record(draft), draft).filter(
      (check) => check.severity === "BLOCKING",
    );
    expect(blocking).toEqual([]);
  });

  it("xuất đủ 18 × 2 dòng, mỗi dòng đúng 49 cột", () => {
    const draft = syntheticDraft();
    const result = buildSubmissionRows(record(draft));
    expect(result.rows).toHaveLength(36);
    expect(result.rows.every((row) => row.length === PL3_DATA_COLUMN_COUNT)).toBe(true);
  });

  it("giữ số 0 đầu và cả ba nhóm loại đất theo đúng thửa", () => {
    const draft = syntheticDraft();
    const [firstRow] = buildSubmissionRows(record(draft)).rows;
    expect(firstRow[18]).toBe("01");
    expect(firstRow[19]).toBe("001");
    expect(firstRow[24]).toBe("Đất ở tại đô thị");
    expect(firstRow[29]).toBe("Đất trồng cây lâu năm");
    expect(firstRow[34]).toBe("Đất trồng cây hằng năm khác");
  });

  it("xuất tài sản đúng thửa và không nhân sang thửa khác", () => {
    const draft = syntheticDraft(2);
    const rows = buildSubmissionRows(record(draft)).rows;
    expect(rows[0][39]).toBe("Nhà ở");
    expect(rows[1][39]).toBe("Nhà ở");
    expect(rows[2][39]).toBe("");
    expect(rows[3][39]).toBe("");
  });
});
