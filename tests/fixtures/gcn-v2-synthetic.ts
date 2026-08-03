import type {
  GcnExtractionDataV2,
  GcnExtractionEvidenceV2,
  GcnExtractionPayloadV2,
} from "@/modules/ai-extraction/gcn-v2-contract";
import { collectGcnV2FieldObservations } from "@/modules/ai-extraction/gcn-v2-schema";

const FILE_COVER = "gcn-file-cover-a";
const FILE_DETAILS = "gcn-file-details-b";
const FILE_SUPPLEMENT = "gcn-file-supplement-c";
const FILE_CHANGES = "gcn-file-changes-d";

/**
 * Fixture thuần synthetic: hai chủ (cá nhân + tổ chức), 18 thửa, ba mục đích/thửa, tài sản,
 * trang bổ sung và biến động. Không chứa số định danh cá nhân hoặc dữ liệu hồ sơ thật.
 */
export function buildSyntheticGcnV2Payload(): GcnExtractionPayloadV2 {
  const data: GcnExtractionDataV2 = {
    certificate: {
      issueNumber: "AB 000123",
      issueDate: "2026-08-03",
      registryNumber: "CS 001",
    },
    owners: [
      {
        stableKey: "owner_a1b2c3d4e5f60708",
        ownerType: "CA_NHAN",
        organisationName: null,
        organisationIdentityNumber: null,
        fullName: "NGUYEN VAN A",
        dateOfBirth: "1980-02-29",
        gender: "NAM",
        residenceAddress: "Phuong Phong Chau, tinh Phu Tho",
        roleOnCertificate: "CA_NHAN",
      },
      {
        stableKey: "owner_b1c2d3e4f5060718",
        ownerType: "TO_CHUC",
        organisationName: "CONG TY TNHH MINH HOA",
        organisationIdentityNumber: "MST-PC-001",
        fullName: "TRAN THI B",
        dateOfBirth: null,
        gender: null,
        residenceAddress: "Phuong Phong Chau, tinh Phu Tho",
        roleOnCertificate: "NGUOI_DAI_DIEN",
      },
    ],
    parcels: Array.from({ length: 18 }, (_, parcelIndex) => {
      const ordinal = parcelIndex + 1;
      const parcelOrdinal = String(ordinal).padStart(3, "0");
      const parcelStableKey = `parcel_${parcelOrdinal}_a1b2c3d4`;
      return {
        stableKey: parcelStableKey,
        parcelIdCode: `PC-${parcelOrdinal}`,
        mapSheetNumber:
          ordinal === 1
            ? "01"
            : ordinal === 17
              ? null
              : String(Math.ceil(ordinal / 3)).padStart(2, "0"),
        parcelNumber: ordinal === 1 ? "001" : ordinal === 18 ? null : parcelOrdinal,
        addressOnCertificate: `Thua synthetic ${parcelOrdinal}, Phong Chau`,
        oldWard: ordinal === 16 ? null : ordinal % 3 === 0 ? "HA_THACH" : "PHU_HO",
        area: `${100 + ordinal}.50`,
        landUses: [
          {
            stableKey: `landuse_${parcelOrdinal}_01_a1b2`,
            purposeCode: "ONT",
            purposeFreeText: null,
            area: "40.25",
            originCode: "NHA_NUOC_CONG_NHAN",
            formCode: "SU_DUNG_RIENG",
            termCode: "SU_DUNG_ON_DINH_LAU_DAI",
          },
          {
            stableKey: `landuse_${parcelOrdinal}_02_a1b2`,
            purposeCode: "CLN",
            purposeFreeText: null,
            area: "30.25",
            originCode: "NHAN_CHUYEN_QUYEN",
            formCode: "SU_DUNG_CHUNG",
            termCode: "SU_DUNG_CO_THOI_HAN",
          },
          {
            stableKey: `landuse_${parcelOrdinal}_03_a1b2`,
            purposeCode: "GHI_THEO_BIA",
            purposeFreeText: "Dat vuon theo bia",
            area: "30.00",
            originCode: "NGUON_GOC_KHAC",
            formCode: "SU_DUNG_RIENG_VA_CHUNG",
            termCode: "SU_DUNG_CO_THOI_HAN",
          },
        ],
      };
    }),
    assets: [
      {
        stableKey: "asset_a1b2c3d4e5f60708",
        parcelStableKey: "parcel_001_a1b2c3d4",
        assetType: "NHA_O",
        description: "Nha o rieng le hai tang",
        mixedUseBuildingName: null,
        apartmentBuildingName: null,
        apartmentNumber: "01",
        constructionArea: "80.50",
        floorArea: "161.00",
        ownershipForm: "So huu rieng",
        ownershipTerm: "Lau dai",
        grade: null,
      },
    ],
    registeredChanges: [
      {
        stableKey: "change_a1b2c3d4e5f60708",
        confirmedDate: "2025-12-31",
        content: "Dang ky bo sung tai san gan lien voi dat",
        confirmedBy: "Co quan dang ky dat dai",
      },
    ],
  };

  const pages = [
    {
      fileId: FILE_COVER,
      pageNumber: 1,
      pageType: "COVER" as const,
      rotationDegrees: 0 as const,
      imageStatus: "CLEAR" as const,
      ownerStableKeys: data.owners.map((owner) => owner.stableKey),
      parcelStableKeys: [],
      registeredChangeStableKeys: [],
      warnings: [],
    },
    {
      fileId: FILE_DETAILS,
      pageNumber: 1,
      pageType: "OWNER_AND_PARCEL" as const,
      rotationDegrees: 90 as const,
      imageStatus: "BLURRY" as const,
      ownerStableKeys: data.owners.map((owner) => owner.stableKey),
      parcelStableKeys: data.parcels.slice(0, 9).map((parcel) => parcel.stableKey),
      registeredChangeStableKeys: [],
      warnings: ["Anh xoay 90 do; mot so ky tu can doi chieu."],
    },
    {
      fileId: FILE_SUPPLEMENT,
      pageNumber: 1,
      pageType: "SUPPLEMENT" as const,
      rotationDegrees: 180 as const,
      imageStatus: "MIXED" as const,
      ownerStableKeys: [],
      parcelStableKeys: data.parcels.slice(9).map((parcel) => parcel.stableKey),
      registeredChangeStableKeys: [],
      warnings: ["Trang bo sung co vung mo va chu viet tay."],
    },
    {
      fileId: FILE_CHANGES,
      pageNumber: 1,
      pageType: "REGISTERED_CHANGE" as const,
      rotationDegrees: 0 as const,
      imageStatus: "CLEAR" as const,
      ownerStableKeys: [],
      parcelStableKeys: [data.parcels[0].stableKey],
      registeredChangeStableKeys: data.registeredChanges.map((change) => change.stableKey),
      warnings: [],
    },
  ];

  const evidence = collectGcnV2FieldObservations({ data }).flatMap((observation) => {
    const location = evidenceLocation(observation.fieldPath);
    if (observation.fieldPath === "parcels[parcel_018_a1b2c3d4].parcelNumber") {
      return [
        conflictEvidence(observation.fieldPath, "018?", FILE_SUPPLEMENT),
        conflictEvidence(observation.fieldPath, "016?", FILE_SUPPLEMENT),
      ];
    }
    if (observation.fieldPath === "parcels[parcel_017_a1b2c3d4].area") {
      return [
        {
          fieldPath: observation.fieldPath,
          rawText: "117,50 m2",
          fileId: location.fileId,
          pageNumber: 1,
          confidence: 0.55,
          status: "LOW_CONFIDENCE" as const,
        },
      ];
    }
    if (observation.fieldPath === "parcels[parcel_016_a1b2c3d4].oldWard") {
      return [
        {
          fieldPath: observation.fieldPath,
          rawText: "Xa cu bi mo",
          fileId: location.fileId,
          pageNumber: 1,
          confidence: 0.42,
          status: "LOW_CONFIDENCE" as const,
        },
      ];
    }
    if (observation.fieldPath === "parcels[parcel_017_a1b2c3d4].mapSheetNumber") {
      return [
        {
          fieldPath: observation.fieldPath,
          rawText: "0?",
          fileId: location.fileId,
          pageNumber: 1,
          confidence: 0.2,
          status: "UNREADABLE" as const,
        },
      ];
    }
    if (observation.fieldPath === "assets[asset_a1b2c3d4e5f60708].grade") {
      return [missingEvidence(observation.fieldPath, location.fileId)];
    }
    if (observation.value === null) {
      return [missingEvidence(observation.fieldPath, location.fileId)];
    }
    return [
      {
        fieldPath: observation.fieldPath,
        rawText: observation.value,
        fileId: location.fileId,
        pageNumber: 1,
        confidence: 0.96,
        status: "EXTRACTED" as const,
      },
    ];
  });

  return {
    quality: {
      documentType: "CERTIFICATE",
      imageStatus: "MIXED",
      note: "Bo anh synthetic co trang xoay, vung mo va trang bo sung.",
    },
    data,
    pages,
    evidence,
    metadata: {
      schemaVersion: "gcn-v2.0",
      promptVersion: "gcn-v2.0",
      modelIdentifier: "synthetic-test-model",
      pagesProcessed: pages.length,
      sourceDocumentHash: "a".repeat(64),
      processedAt: "2026-08-03T10:15:30Z",
    },
    warnings: [
      "Bo fixture chu dong mo phong trang mo va xoay.",
      "Thieu anh trang so do; khong suy dien du lieu dia chinh.",
    ],
  };
}

function evidenceLocation(fieldPath: string): { fileId: string } {
  if (fieldPath.startsWith("certificate.")) return { fileId: FILE_COVER };
  if (fieldPath.startsWith("owners[")) return { fileId: FILE_COVER };
  if (fieldPath.startsWith("assets[")) return { fileId: FILE_DETAILS };
  if (fieldPath.startsWith("registeredChanges[")) return { fileId: FILE_CHANGES };
  const match = /parcels\[parcel_(\d{3})_/.exec(fieldPath);
  const ordinal = Number(match?.[1] ?? "1");
  return { fileId: ordinal <= 9 ? FILE_DETAILS : FILE_SUPPLEMENT };
}

function missingEvidence(fieldPath: string, fileId: string): GcnExtractionEvidenceV2 {
  return {
    fieldPath,
    rawText: null,
    fileId,
    pageNumber: 1,
    confidence: null,
    status: "NOT_FOUND",
  };
}

function conflictEvidence(
  fieldPath: string,
  rawText: string,
  fileId: string,
): GcnExtractionEvidenceV2 {
  return {
    fieldPath,
    rawText,
    fileId,
    pageNumber: 1,
    confidence: 0.48,
    status: "CONFLICT",
  };
}
