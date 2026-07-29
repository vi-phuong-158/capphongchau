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
  /**
   * Cột F/G của PL3. Hai trường riêng để không còn dùng `fullName`/`identityNumber` cho cả tổ chức
   * lẫn người đại diện. Dấu `?` giữ tương thích với payload đã lưu trước migration 202607290002.
   */
  organisationName?: string;
  organisationIdentityNumber?: string;
  /** Cột H — tên chủ sử dụng hoặc người đại diện theo pháp luật của tổ chức. */
  fullName: string;
  /** Cột K — CCCD của chủ sử dụng/người đại diện. */
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
  identityStatus:
    "PENDING_CONFIRMATION" | "QR_CONFIRMED" | "QR_OVERRIDE_PENDING_REVIEW" | "MANUAL_COMPLETE" | "";
  identityConfirmedAt: string;
  /** Bắt buộc khi sửa họ tên/CCCD/ngày sinh/giới tính sau QR; địa chỉ vẫn được sửa bình thường. */
  identityOverrideReason: string;
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
  /**
   * Cột V. Rỗng nghĩa là dùng giá trị tự động suy ra từ `oldWard` + `mapSheetNumber`; có giá trị
   * nghĩa là cán bộ ghi đè và bắt buộc kèm `cadastralMapSheetOverrideReason`.
   */
  cadastralMapSheetNumber?: string;
  cadastralMapSheetOverrideReason?: string;
  /** Cột W — số thứ tự thửa trên bản đồ địa chính, nhập thủ công khi có nguồn đối chiếu. */
  cadastralParcelNumber?: string;
  /** Trường 11 — bắt buộc, đơn vị m². */
  area: string;
  landUses: LandUse[];
}

/** Cột AO–AW — tài sản gắn liền với đất/nhà ở. */
export interface Asset {
  readonly id: string;
  /** Thửa liên quan; rỗng chỉ dành cho payload cũ và được xuất cho mọi thửa để không mất dữ liệu. */
  parcelId?: string;
  assetType: string;
  description: string;
  mixedUseBuildingName?: string;
  apartmentBuildingName?: string;
  apartmentNumber?: string;
  constructionArea?: string;
  floorArea?: string;
  ownershipForm?: string;
  ownershipTerm?: string;
  grade?: string;
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
  /**
   * Cột B và AX là trường hệ thống. Chuỗi override rỗng/không có nghĩa là dùng giá trị tự động;
   * khi ghi đè phải có lý do để audit và truy nguyên.
   */
  wardAdministrativeCodeOverride?: string;
  wardAdministrativeCodeOverrideReason?: string;
  scannedFileNamesOverride?: string;
  scannedFileNamesOverrideReason?: string;
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
    cadastralMapSheetNumber: "",
    cadastralMapSheetOverrideReason: "",
    cadastralParcelNumber: "",
    area: "",
    landUses: [emptyLandUse(landUseId)],
  };
}

export function emptyOwner(id: string): Owner {
  return {
    id,
    ownerType: "CA_NHAN",
    organisationName: "",
    organisationIdentityNumber: "",
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
    identityOverrideReason: "",
    roleOnCertificate: "",
    hasDistinctCurrentUser: false,
    currentUserName: "",
    currentUserCitizenId: "",
    currentUserAddress: "",
    changeReason: "",
  };
}

export function emptyAsset(id: string, parcelId = ""): Asset {
  return {
    id,
    parcelId,
    assetType: "",
    description: "",
    mixedUseBuildingName: "",
    apartmentBuildingName: "",
    apartmentNumber: "",
    constructionArea: "",
    floorArea: "",
    ownershipForm: "",
    ownershipTerm: "",
    grade: "",
  };
}

/**
 * Dòng tổ chức lưu trước migration 202607290002 giữ tên và mã số tổ chức trong `fullName`/
 * `identityNumber`. Bàn biên tập đầy đủ dùng đúng hai ô đó cho **người đại diện** (cột H/K), nên
 * dữ liệu cũ phải được chuyển sang `organisationName`/`organisationIdentityNumber` (cột F/G)
 * trước lần sửa đầu tiên — bỏ bước này thì cán bộ gõ tên người đại diện vào ô H sẽ ghi đè mất tên
 * tổ chức, không có cảnh báo và không khôi phục được.
 *
 * Hàm này idempotent: dòng đã có F/G, hoặc dòng cá nhân, đều trả về nguyên trạng.
 */
export function migrateLegacyOrganisationOwner(owner: Owner): Owner {
  if (!isOrganisationOwner(owner.ownerType)) return owner;
  if (owner.organisationName?.trim() || owner.organisationIdentityNumber?.trim()) return owner;
  return {
    ...owner,
    organisationName: owner.fullName,
    organisationIdentityNumber: owner.identityNumber,
    fullName: "",
    identityNumber: "",
  };
}

/**
 * Gỡ `parcelId` của tài sản trỏ tới thửa không còn tồn tại.
 *
 * `draftSchema` từ chối payload có `asset.parcelId` mồ côi, và lỗi đó tới cán bộ dưới dạng lỗi cấu
 * trúc chung không chỉ ra được ô nào — nên xóa thửa mà không gỡ tham chiếu sẽ làm nút Lưu hỏng
 * theo cách không giải thích được. Để rỗng thì lưu được, còn `completionChecks` vẫn chặn lúc tiếp
 * nhận kèm thông báo đúng chỗ.
 */
export function detachAssetsFromMissingParcels(
  assets: readonly Asset[],
  parcels: readonly Parcel[],
): Asset[] {
  const parcelIds = new Set(parcels.map((parcel) => parcel.id));
  return assets.map((asset) =>
    asset.parcelId && !parcelIds.has(asset.parcelId) ? { ...asset, parcelId: "" } : asset,
  );
}

export function emptyDraft(ownerId: string, parcelId: string, landUseId: string): IntakeDraft {
  return {
    certificate: { issueNumber: "", issueDate: "", registryNumber: "" },
    owners: [emptyOwner(ownerId)],
    parcels: [emptyParcel(parcelId, landUseId)],
    assets: [],
    certificateFileMetadata: [],
    wardAdministrativeCodeOverride: "",
    wardAdministrativeCodeOverrideReason: "",
    scannedFileNamesOverride: "",
    scannedFileNamesOverrideReason: "",
    phone: "",
    consentAccepted: false,
  };
}
