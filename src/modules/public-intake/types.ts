/**
 * Mô hình dữ liệu kê khai công khai — bám theo 15 trường của `Tai lieu/Phụ lục 8.docx`
 * ("Bảng trường thông tin dữ liệu bắt buộc — checklist kiểm tra nhanh cấp xã").
 *
 * Số trong chú thích là số thứ tự trường trong Phụ lục 8. Xem bảng đối chiếu đầy đủ ở
 * `PLAN_NL.md` §5.3.
 */

/** Trường 5, 6, 7 — GCN có thể cấp cho cá nhân, hộ gia đình, vợ chồng hoặc tổ chức. */
export const OWNER_TYPES = ["CA_NHAN", "HO_GIA_DINH", "VO_CHONG", "TO_CHUC"] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

export const OWNER_TYPE_LABELS: Record<OwnerType, string> = {
  CA_NHAN: "Cá nhân",
  HO_GIA_DINH: "Hộ gia đình",
  VO_CHONG: "Vợ chồng",
  TO_CHUC: "Tổ chức",
};

/** Trường 6 chỉ bắt buộc CCCD 12 số với cá nhân/vợ chồng. */
export function requiresCitizenId(ownerType: OwnerType): boolean {
  return ownerType === "CA_NHAN" || ownerType === "VO_CHONG";
}

export interface Owner {
  readonly id: string;
  ownerType: OwnerType;
  /** Trường 5 — tên chủ sử dụng hoặc tên tổ chức. */
  fullName: string;
  /** Trường 6 — CCCD 12 số, hoặc số định danh tổ chức. */
  identityNumber: string;
  /** Trường 7 — vai trò pháp nhân trên GCN. */
  roleOnCertificate: string;
}

/** Trường 12 — mỗi thửa có thể có nhiều dòng mục đích sử dụng. */
export interface LandUse {
  readonly id: string;
  purposeCode: string;
  originCode: string;
  formCode: string;
  termCode: string;
  /** Diện tích theo từng mục đích — Phụ lục 8 không bắt buộc, để tùy chọn. */
  area: string;
}

export interface Parcel {
  readonly id: string;
  /** Trường 8 — "Nếu có". Người dân thường không có mã này. */
  parcelIdCode: string;
  /** Trường 9 — "tuỳ trường hợp xác định được trên bản đồ", cho phép trống. */
  mapSheetNumber: string;
  parcelNumber: string;
  /**
   * Trường 10 — lưu hai dạng:
   * `addressOnCertificate` là nguyên văn in trên bìa GCN (thường theo địa danh 3 cấp cũ),
   * `addressTwoLevel` là địa chỉ hai cấp sau sáp nhập, do cán bộ chuẩn hóa khi duyệt.
   */
  addressOnCertificate: string;
  addressTwoLevel: string;
  /** Trường 11 — bắt buộc, đơn vị m². */
  area: string;
  landUses: LandUse[];
}

/** Trường 13 — "Nếu có". */
export interface Asset {
  readonly id: string;
  assetType: string;
  description: string;
}

/** Trường 2, 3, 4. */
export interface CertificateInfo {
  issueNumber: string;
  issueDate: string;
  registryNumber: string;
}

export interface IntakeDraft {
  certificate: CertificateInfo;
  owners: Owner[];
  parcels: Parcel[];
  assets: Asset[];
  /** Không thuộc Phụ lục 8 — thu để cán bộ gọi điện liên hệ (PLAN_NL §4.5). */
  phone: string;
  consentAccepted: boolean;
}

export function emptyLandUse(id: string): LandUse {
  return { id, purposeCode: "", originCode: "", formCode: "", termCode: "", area: "" };
}

export function emptyParcel(id: string, landUseId: string): Parcel {
  return {
    id,
    parcelIdCode: "",
    mapSheetNumber: "",
    parcelNumber: "",
    addressOnCertificate: "",
    addressTwoLevel: "",
    area: "",
    landUses: [emptyLandUse(landUseId)],
  };
}

export function emptyOwner(id: string): Owner {
  return { id, ownerType: "CA_NHAN", fullName: "", identityNumber: "", roleOnCertificate: "" };
}

export function emptyAsset(id: string): Asset {
  return { id, assetType: "", description: "" };
}

export function emptyDraft(ownerId: string, parcelId: string, landUseId: string): IntakeDraft {
  return {
    certificate: { issueNumber: "", issueDate: "", registryNumber: "" },
    owners: [emptyOwner(ownerId)],
    parcels: [emptyParcel(parcelId, landUseId)],
    assets: [],
    phone: "",
    consentAccepted: false,
  };
}
