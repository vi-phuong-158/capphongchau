/**
 * Mô hình dữ liệu kê khai công khai — bám theo 15 trường của `Tai lieu/Phụ lục 8.docx`
 * ("Bảng trường thông tin dữ liệu bắt buộc — checklist kiểm tra nhanh cấp xã").
 *
 * Số trong chú thích là số thứ tự trường trong Phụ lục 8. Xem bảng đối chiếu đầy đủ ở
 * `PLAN_NL.md` §5.3.
 */

/**
 * Trường 12 của PL3 — "Pháp nhân trên GCN".
 *
 * Sáu giá trị và thứ tự lấy nguyên từ ràng buộc dữ liệu (data validation) nhúng trong
 * `Tai lieu/PL3.xlsx`, nên `OWNER_TYPE_LABELS` **chính là** chuỗi phải ghi ra khi xuất — đừng sửa
 * nhãn cho "gọn" rồi làm lệch file nộp.
 */
export const OWNER_TYPES = [
  "CA_NHAN",
  "HO_GIA_DINH",
  "VO_CHONG",
  "DONG_SU_DUNG",
  "CONG_DONG_DAN_CU",
  "TO_CHUC",
] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

export const OWNER_TYPE_LABELS: Record<OwnerType, string> = {
  CA_NHAN: "Cá nhân",
  HO_GIA_DINH: "Hộ gia đình",
  VO_CHONG: "Vợ chồng",
  DONG_SU_DUNG: "Đồng sử dụng",
  CONG_DONG_DAN_CU: "Cộng đồng dân cư",
  TO_CHUC: "Tổ chức",
};

/**
 * Pháp nhân là **người tự nhiên** — bắt buộc CCCD 12 số, ngày sinh, giới tính, địa chỉ và đủ cặp
 * ảnh CCCD.
 *
 * Trước 2026-07-22 hàm này loại trừ cả `HO_GIA_DINH`, khiến chọn "Hộ gia đình" là bỏ qua toàn bộ
 * phần định danh — nộp được hồ sơ chỉ với một cái tên. PL3 mẫu có CCCD ở **cả** ba dòng hộ gia
 * đình (CCCD của chủ hộ), nên đó là lỗi chứ không phải thiết kế.
 */
export function requiresCitizenId(ownerType: OwnerType): boolean {
  return !isOrganisationOwner(ownerType);
}

/**
 * Tổ chức và cộng đồng dân cư không có CCCD 12 số — định danh là mã số thuế / mã số quyết định
 * thành lập. Vẫn bắt buộc có mã và địa chỉ trụ sở, chỉ miễn ngày sinh/giới tính/ảnh CCCD.
 */
export function isOrganisationOwner(ownerType: OwnerType): boolean {
  return ownerType === "TO_CHUC" || ownerType === "CONG_DONG_DAN_CU";
}

export interface Owner {
  readonly id: string;
  ownerType: OwnerType;
  /** Trường 5 — tên chủ sử dụng hoặc tên tổ chức. */
  fullName: string;
  /** Trường 6 — CCCD 12 số, hoặc số định danh tổ chức. */
  identityNumber: string;
  /** Dữ liệu gợi ý từ QR CCCD hoặc do người kê khai nhập tay. */
  dateOfBirth: string;
  gender: "NAM" | "NU" | "";
  residenceAddress: string;
  identitySource: "QR" | "MANUAL" | "";
  /** Không lưu payload QR thô, chỉ giữ hash và phiên bản xử lý để truy vết. */
  qrPayloadHash: string;
  qrDecoderVersion: string;
  qrParserVersion: string;
  identityStatus: "PENDING_CONFIRMATION" | "QR_CONFIRMED" | "MANUAL_COMPLETE" | "";
  identityConfirmedAt: string;
  /** Trường 7 — vai trò pháp nhân trên GCN. */
  roleOnCertificate: string;
  /**
   * Nhóm "Người sử dụng đất hiện tại" của PL3 (cột O, P và trường 14, 15) — chỉ dùng khi người
   * đứng tên trên GCN **không còn** là người sử dụng thực tế: đã mất, thừa kế, tặng cho, chuyển
   * nhượng. Nguồn "đã có dữ liệu" bỏ cột O/P vì đưa vào dùng ngay, nhưng khi thu thập vẫn phải có
   * để xử lý các ca này.
   *
   * Khi bật, người trên GCN (có thể đã mất) được **miễn** ảnh CCCD/QR và các trường định danh; đổi
   * lại phải khai đủ thông tin người sử dụng hiện tại bên dưới. Cán bộ đối chiếu giấy tờ thừa
   * kế/sang tên khi duyệt.
   */
  hasDistinctCurrentUser: boolean;
  /** Cột O — tên người sử dụng hiện tại. */
  currentUserName: string;
  /** Cột P — số định danh cá nhân (CCCD 12 số) của người sử dụng hiện tại. */
  currentUserCitizenId: string;
  /** Trường 14 — địa chỉ thường trú hai cấp của người sử dụng hiện tại. */
  currentUserAddress: string;
  /** Trường 15 — lý do thay đổi; mã trong `CHANGE_REASON_OPTIONS`. */
  changeReason: string;
}

/**
 * PL3 chỉ chừa **ba** bộ cột loại đất cho mỗi thửa (cột Z–AD, AE–AI, AJ–AN). Không chặn ở đây thì
 * thửa khai 4 mục đích vẫn nộp được rồi âm thầm mất dòng thứ tư lúc xuất — mất dữ liệu không ai
 * thấy, tệ hơn là báo lỗi ngay lúc khai.
 */
export const MAX_LAND_USES_PER_PARCEL = 3;

/** Trường 12 — mỗi thửa có thể có nhiều dòng mục đích sử dụng. */
export interface LandUse {
  readonly id: string;
  purposeCode: string;
  /**
   * Chữ tự do người dân ghi theo bìa GCN khi `purposeCode` là `GHI_THEO_BIA` (loại đất không có
   * mã trong danh mục). Rỗng với mọi lựa chọn khác. Xuất PL3 ghi thẳng chuỗi này.
   */
  purposeFreeText: string;
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
  /**
   * Đơn vị hành chính cũ nơi cấp GCN — `PHU_HO` | `HA_THACH` | `PHONG_CHAU_CU` | `KHONG_RO`.
   *
   * Không thuộc Phụ lục 8 nhưng bắt buộc để suy ra trường 19 của PL3 ("Số hiệu tờ trên bản đồ địa
   * chính"): ba xã cũ đều đánh số tờ bản đồ từ 1, nên không biết đơn vị cũ thì "tờ 5" có ba đáp án.
   */
  oldWard: string;
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

/** Thứ tự + nhãn do người kê khai đặt cho các trang GCN đã upload. */
export interface CertificateFileMetadata {
  fileId: string;
  pageLabel: string;
}

export interface IntakeDraft {
  certificate: CertificateInfo;
  owners: Owner[];
  parcels: Parcel[];
  assets: Asset[];
  /**
   * Nằm trong `draft_json`, không thêm cột `PUBLIC_FILES`: đủ để khôi phục thứ tự/nhãn khi đổi
   * thiết bị, còn trạng thái và Drive ID vẫn chỉ lấy từ `PUBLIC_FILES`.
   */
  certificateFileMetadata?: CertificateFileMetadata[];
  /** Không thuộc Phụ lục 8 — thu để cán bộ gọi điện liên hệ (PLAN_NL §4.5). */
  phone: string;
  consentAccepted: boolean;
}

export function emptyLandUse(id: string): LandUse {
  return {
    id,
    purposeCode: "",
    purposeFreeText: "",
    originCode: "",
    formCode: "",
    termCode: "",
    area: "",
  };
}

export function emptyParcel(id: string, landUseId: string): Parcel {
  return {
    id,
    parcelIdCode: "",
    mapSheetNumber: "",
    parcelNumber: "",
    addressOnCertificate: "",
    addressTwoLevel: "",
    oldWard: "",
    area: "",
    landUses: [emptyLandUse(landUseId)],
  };
}

export function emptyOwner(id: string): Owner {
  return {
    id,
    ownerType: "CA_NHAN",
    fullName: "",
    identityNumber: "",
    dateOfBirth: "",
    gender: "",
    residenceAddress: "",
    identitySource: "",
    qrPayloadHash: "",
    qrDecoderVersion: "",
    qrParserVersion: "",
    identityStatus: "",
    identityConfirmedAt: "",
    roleOnCertificate: "",
    hasDistinctCurrentUser: false,
    currentUserName: "",
    currentUserCitizenId: "",
    currentUserAddress: "",
    changeReason: "",
  };
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
    certificateFileMetadata: [],
    phone: "",
    consentAccepted: false,
  };
}
