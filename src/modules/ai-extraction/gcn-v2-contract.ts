/**
 * Hợp đồng GCN v2 dùng chung cho extraction, so sánh, nạp nháp và kiểm thử.
 *
 * Đích nghiệp vụ vẫn là `IntakeDraft`; kiểu extraction giữ `null` cho dữ liệu không nhìn thấy để
 * phân biệt rõ "không đọc được" với chuỗi rỗng của form. Số tờ, số thửa và diện tích đều là chuỗi
 * vì payload/PL3 hiện tại cần giữ số 0 đầu và cách ghi thập phân trên GCN.
 */
export const GCN_V2_SCHEMA_VERSION = "gcn-v2.0" as const;
export const GCN_V2_PROMPT_VERSION = "gcn-v2.0" as const;

export const GCN_EVIDENCE_STATUSES = [
  "EXTRACTED",
  "LOW_CONFIDENCE",
  "UNREADABLE",
  "CONFLICT",
  "NOT_FOUND",
] as const;
export type GcnEvidenceStatus = (typeof GCN_EVIDENCE_STATUSES)[number];

export const GCN_FIELD_PROVENANCE_STATES = [
  "EMPTY",
  "AI_PROPOSED",
  "CITIZEN_PROVIDED",
  "OFFICER_EDITED",
  "OFFICER_CONFIRMED",
  "CONFLICT",
  "UNREADABLE",
] as const;
export type GcnFieldProvenance = (typeof GCN_FIELD_PROVENANCE_STATES)[number];

export const GCN_PAGE_TYPES = [
  "COVER",
  "OWNER_AND_PARCEL",
  "ASSET",
  "SUPPLEMENT",
  "REGISTERED_CHANGE",
  "OTHER",
  "UNKNOWN",
] as const;
export type GcnPageType = (typeof GCN_PAGE_TYPES)[number];

export interface GcnV2Certificate {
  issueNumber: string | null;
  issueDate: string | null;
  registryNumber: string | null;
}

export interface GcnV2Owner {
  stableKey: string;
  ownerType: string | null;
  organisationName: string | null;
  organisationIdentityNumber: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  residenceAddress: string | null;
  roleOnCertificate: string | null;
}

export interface GcnV2LandUse {
  stableKey: string;
  purposeCode: string | null;
  purposeFreeText: string | null;
  area: string | null;
  originCode: string | null;
  formCode: string | null;
  termCode: string | null;
}

export interface GcnV2Parcel {
  stableKey: string;
  parcelIdCode: string | null;
  mapSheetNumber: string | null;
  parcelNumber: string | null;
  addressOnCertificate: string | null;
  oldWard: string | null;
  area: string | null;
  landUses: GcnV2LandUse[];
}

/** Tài sản giữ ở mảng đỉnh giống `IntakeDraft.assets`; `parcelStableKey` nối về thửa AI đọc. */
export interface GcnV2Asset {
  stableKey: string;
  parcelStableKey: string | null;
  assetType: string | null;
  description: string | null;
  mixedUseBuildingName: string | null;
  apartmentBuildingName: string | null;
  apartmentNumber: string | null;
  constructionArea: string | null;
  floorArea: string | null;
  ownershipForm: string | null;
  ownershipTerm: string | null;
  grade: string | null;
}

/**
 * Nội dung biến động chỉ để cán bộ đối chiếu trong panel AI. Nó không tự ghi vào dữ liệu gốc,
 * `hasDistinctCurrentUser` hay `changeReason` vì repository hiện chưa có quan hệ nghiệp vụ đủ chắc.
 */
export interface GcnV2RegisteredChange {
  stableKey: string;
  confirmedDate: string | null;
  content: string | null;
  confirmedBy: string | null;
}

export interface GcnExtractionDataV2 {
  certificate: GcnV2Certificate;
  owners: GcnV2Owner[];
  parcels: GcnV2Parcel[];
  assets: GcnV2Asset[];
  registeredChanges: GcnV2RegisteredChange[];
}

export interface GcnExtractionEvidenceV2 {
  fieldPath: string;
  rawText: string | null;
  fileId: string;
  pageNumber: number | null;
  confidence: number | null;
  status: GcnEvidenceStatus;
}

export interface GcnExtractionPageV2 {
  fileId: string;
  pageNumber: number;
  pageType: GcnPageType;
  rotationDegrees: 0 | 90 | 180 | 270;
  imageStatus: "CLEAR" | "BLURRY" | "HANDWRITING" | "MIXED";
  ownerStableKeys: string[];
  parcelStableKeys: string[];
  registeredChangeStableKeys: string[];
  warnings: string[];
}

export interface GcnExtractionMetadataV2 {
  schemaVersion: typeof GCN_V2_SCHEMA_VERSION;
  promptVersion: typeof GCN_V2_PROMPT_VERSION;
  modelIdentifier: string;
  pagesProcessed: number;
  sourceDocumentHash: string | null;
  processedAt: string;
}

export interface GcnExtractionPayloadV2 {
  quality: {
    documentType: "CERTIFICATE" | "OTHER" | "UNKNOWN";
    imageStatus: "CLEAR" | "BLURRY" | "HANDWRITING" | "MIXED";
    note: string;
  };
  data: GcnExtractionDataV2;
  pages: GcnExtractionPageV2[];
  evidence: GcnExtractionEvidenceV2[];
  metadata: GcnExtractionMetadataV2;
  warnings: string[];
}

export interface GcnFieldContractEntry {
  path: string;
  label: string;
  valueType: "string" | "boolean" | "enum";
  officerForm: boolean;
  completionCheck: boolean;
  pl3Columns: string;
  aiRead: boolean;
  aiApply: "EMPTY_OR_AI_PROPOSED" | "REVIEW_ONLY" | "NEVER";
  requiredAtCompletion: boolean;
  note?: string;
}

/**
 * Registry máy đọc được. UI nhãn AI, merger và test contract phải dùng registry này thay vì tự
 * khai lại danh sách trường. Đường dẫn `[]` là template; comparison thực tế dùng stable ID.
 */
export const GCN_V2_FIELD_CONTRACT = [
  {
    path: "certificate.issueNumber",
    label: "Số phát hành GCN",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "C / trường 2",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
  },
  {
    path: "certificate.issueDate",
    label: "Ngày cấp GCN",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "D / trường 3",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
  },
  {
    path: "certificate.registryNumber",
    label: "Số vào sổ GCN",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "E / trường 4",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
  },
  {
    path: "owners[].ownerType",
    label: "Pháp nhân trên GCN",
    valueType: "enum",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "M / trường 12",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
    note: "Chỉ chuẩn hóa khi chữ trên GCN khớp danh mục; không suy đoán.",
  },
  {
    path: "owners[].organisationName",
    label: "Tên tổ chức",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "F / trường 5",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "owners[].organisationIdentityNumber",
    label: "Số định danh tổ chức",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "G / trường 6",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
    note: "Không áp dụng cho số định danh cá nhân 12 chữ số.",
  },
  {
    path: "owners[].fullName",
    label: "Họ tên chủ sử dụng/người đại diện",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "H / trường 7",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
  },
  {
    path: "owners[].dateOfBirth",
    label: "Ngày sinh",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "I / trường 8",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
    note: "Chỉ đọc ngày đầy đủ; năm sinh đơn lẻ không được biến thành ngày giả.",
  },
  {
    path: "owners[].gender",
    label: "Giới tính",
    valueType: "enum",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "J / trường 9",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
    note: "Chỉ đọc khi GCN ghi rõ; không suy ra từ tên.",
  },
  {
    path: "owners[].identityNumber",
    label: "Số định danh cá nhân/CCCD",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "K / trường 10",
    aiRead: false,
    aiApply: "NEVER",
    requiredAtCompletion: true,
    note: "Giữ guard fail-closed: JSON AI có chuỗi giống CCCD bị chặn.",
  },
  {
    path: "owners[].residenceAddress",
    label: "Địa chỉ thường trú",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "L / trường 11",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
  },
  {
    path: "owners[].roleOnCertificate",
    label: "Vai trò pháp nhân trên GCN",
    valueType: "enum",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "N / trường 13",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
  },
  {
    path: "owners[].hasDistinctCurrentUser",
    label: "Có người sử dụng hiện tại khác",
    valueType: "boolean",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "Điều kiện O–R",
    aiRead: false,
    aiApply: "NEVER",
    requiredAtCompletion: false,
    note: "Nội dung biến động chỉ hiển thị đối chiếu; cán bộ quyết định cờ này.",
  },
  {
    path: "owners[].currentUserName",
    label: "Tên người sử dụng hiện tại",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "O",
    aiRead: false,
    aiApply: "NEVER",
    requiredAtCompletion: false,
  },
  {
    path: "owners[].currentUserCitizenId",
    label: "CCCD người sử dụng hiện tại",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "P",
    aiRead: false,
    aiApply: "NEVER",
    requiredAtCompletion: false,
  },
  {
    path: "owners[].currentUserAddress",
    label: "Địa chỉ người sử dụng hiện tại",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "Q / trường 14",
    aiRead: false,
    aiApply: "NEVER",
    requiredAtCompletion: false,
  },
  {
    path: "owners[].changeReason",
    label: "Lý do thay đổi người sử dụng",
    valueType: "enum",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "R / trường 15",
    aiRead: false,
    aiApply: "NEVER",
    requiredAtCompletion: false,
  },
  {
    path: "parcels[].parcelIdCode",
    label: "Mã định danh thửa đất",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "S / trường 16",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "parcels[].mapSheetNumber",
    label: "Số tờ bản đồ ghi trên GCN",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "T / trường 17",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "parcels[].parcelNumber",
    label: "Số thửa ghi trên GCN",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "U / trường 18",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "parcels[].oldWard",
    label: "Đơn vị hành chính cũ",
    valueType: "enum",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "Nguồn suy ra V / trường 19",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
    note: "Chỉ map khi địa danh in trên GCN khớp OLD_WARD_OPTIONS.",
  },
  {
    path: "parcels[].cadastralMapSheetNumber",
    label: "Số hiệu tờ bản đồ địa chính",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "V / trường 19",
    aiRead: false,
    aiApply: "NEVER",
    requiredAtCompletion: false,
    note: "Giá trị hệ thống suy ra hoặc cán bộ ghi đè có lý do.",
  },
  {
    path: "parcels[].cadastralParcelNumber",
    label: "Số thửa trên bản đồ địa chính",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "W / trường 20",
    aiRead: false,
    aiApply: "NEVER",
    requiredAtCompletion: false,
  },
  {
    path: "parcels[].addressOnCertificate",
    label: "Địa chỉ thửa đất trên GCN",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "X / trường 23",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
  },
  {
    path: "parcels[].addressTwoLevel",
    label: "Địa chỉ thửa đất hai cấp",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "Không xuất trực tiếp",
    aiRead: false,
    aiApply: "NEVER",
    requiredAtCompletion: false,
    note: "Dữ liệu chuẩn hóa nội bộ do cán bộ xác định.",
  },
  {
    path: "parcels[].area",
    label: "Diện tích thửa đất",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "Y / trường 24",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
  },
  {
    path: "parcels[].landUses[].purposeCode",
    label: "Mã loại đất",
    valueType: "enum",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "Z, AE, AJ / trường 25, 30, 35",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
  },
  {
    path: "parcels[].landUses[].purposeFreeText",
    label: "Loại đất nguyên văn trên GCN",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "Z, AE, AJ khi GHI_THEO_BIA",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "parcels[].landUses[].area",
    label: "Diện tích theo mục đích",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "AA, AF, AK / trường 26, 31, 36",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "parcels[].landUses[].originCode",
    label: "Nguồn gốc sử dụng",
    valueType: "enum",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "AB, AG, AL / trường 27, 32, 37",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
  },
  {
    path: "parcels[].landUses[].formCode",
    label: "Hình thức sử dụng",
    valueType: "enum",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "AC, AH, AM / trường 28, 33, 38",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
  },
  {
    path: "parcels[].landUses[].termCode",
    label: "Thời hạn sử dụng",
    valueType: "enum",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "AD, AI, AN / trường 29, 34, 39",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: true,
  },
  {
    path: "assets[].assetType",
    label: "Loại tài sản gắn liền với đất",
    valueType: "enum",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "AO / trường 40",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "assets[].description",
    label: "Mô tả tài sản",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "Không xuất trực tiếp",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "assets[].mixedUseBuildingName",
    label: "Khu nhà chung cư/nhà hỗn hợp",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "AP / trường 41",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "assets[].apartmentBuildingName",
    label: "Nhà chung cư",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "AQ / trường 42",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "assets[].apartmentNumber",
    label: "Số căn hộ",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "AR / trường 43",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "assets[].constructionArea",
    label: "Diện tích xây dựng",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "AS / trường 44",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "assets[].floorArea",
    label: "Diện tích sàn",
    valueType: "string",
    officerForm: true,
    completionCheck: true,
    pl3Columns: "AT / trường 45",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "assets[].ownershipForm",
    label: "Hình thức sở hữu",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "AU / trường 46",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "assets[].ownershipTerm",
    label: "Thời hạn sở hữu",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "AV / trường 47",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "assets[].grade",
    label: "Cấp hạng",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "AW / trường 48",
    aiRead: true,
    aiApply: "EMPTY_OR_AI_PROPOSED",
    requiredAtCompletion: false,
  },
  {
    path: "registeredChanges[]",
    label: "Nội dung biến động đăng ký",
    valueType: "string",
    officerForm: true,
    completionCheck: false,
    pl3Columns: "Không xuất trực tiếp",
    aiRead: true,
    aiApply: "REVIEW_ONLY",
    requiredAtCompletion: false,
    note: "Hiển thị trong panel AI; không tự sửa dữ liệu gốc hay lý do thay đổi.",
  },
] as const satisfies readonly GcnFieldContractEntry[];

export type GcnV2FieldTemplate = (typeof GCN_V2_FIELD_CONTRACT)[number]["path"];

export function gcnV2FieldDefinition(path: string): GcnFieldContractEntry | undefined {
  return GCN_V2_FIELD_CONTRACT.find((entry) => entry.path === path);
}
