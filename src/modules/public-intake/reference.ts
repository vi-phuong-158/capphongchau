/**
 * Danh mục mã cho trường 12 của Phụ lục 8 (loại đất, nguồn gốc, hình thức, thời hạn).
 *
 * ⚠️ TOÀN BỘ DANH MỤC DƯỚI ĐÂY LÀ GIÁ TRỊ TẠM CHO BẢN DEMO — CHƯA PHẢI MÃ CHÍNH THỨC.
 *
 * Phụ lục 8 chỉ nêu tên trường, không kèm bảng mã; kế hoạch chiến dịch 180 ngày cũng không có.
 * Bảng mã chính thức phải xin từ Chi nhánh VPĐKĐĐ Phú Thọ hoặc đơn vị thi công (đơn vị giữ
 * Phụ lục 02 — bộ 50 trường của Cục Quản lý đất đai).
 *
 * Xem `PLAN_NL.md` §5.3 mục V1. Không dùng bản này cho dữ liệu thật: sai mã thì toàn bộ hồ sơ
 * đã thu phải nhập lại, và lỗi không lộ ra khi chạy thử.
 */

export const REFERENCE_IS_PLACEHOLDER = true;

export interface ReferenceOption {
  readonly code: string;
  readonly label: string;
}

/** TẠM — chờ danh mục chính thức. */
export const LAND_PURPOSE_OPTIONS: readonly ReferenceOption[] = [
  { code: "ODT", label: "Đất ở tại đô thị" },
  { code: "ONT", label: "Đất ở tại nông thôn" },
  { code: "CLN", label: "Đất trồng cây lâu năm" },
  { code: "BHK", label: "Đất trồng cây hàng năm khác" },
  { code: "LUC", label: "Đất chuyên trồng lúa nước" },
  { code: "RSX", label: "Đất rừng sản xuất" },
  { code: "NTS", label: "Đất nuôi trồng thủy sản" },
  { code: "CDG", label: "Đất có mục đích công cộng" },
];

/** TẠM — chờ danh mục chính thức. */
export const LAND_ORIGIN_OPTIONS: readonly ReferenceOption[] = [
  { code: "CN_QSD", label: "Nhà nước công nhận quyền sử dụng đất" },
  { code: "GIAO_CO_THU_TIEN", label: "Nhà nước giao đất có thu tiền sử dụng đất" },
  { code: "GIAO_KHONG_THU_TIEN", label: "Nhà nước giao đất không thu tiền sử dụng đất" },
  { code: "THUE_TRA_HANG_NAM", label: "Nhà nước cho thuê đất trả tiền hàng năm" },
  { code: "THUE_TRA_MOT_LAN", label: "Nhà nước cho thuê đất trả tiền một lần" },
];

/** TẠM — chờ danh mục chính thức. */
export const LAND_USE_FORM_OPTIONS: readonly ReferenceOption[] = [
  { code: "RIENG", label: "Sử dụng riêng" },
  { code: "CHUNG", label: "Sử dụng chung" },
  { code: "RIENG_VA_CHUNG", label: "Sử dụng riêng và sử dụng chung" },
];

/** TẠM — chờ danh mục chính thức. */
export const LAND_USE_TERM_OPTIONS: readonly ReferenceOption[] = [
  { code: "LAU_DAI", label: "Lâu dài" },
  { code: "CO_THOI_HAN", label: "Có thời hạn (ghi rõ đến ngày trên GCN)" },
];

/**
 * Trường 7 — vai trò pháp nhân trên GCN.
 * ⚠️ TẠM: nội hàm trường này chưa được xác nhận bởi người am hiểu nghiệp vụ
 * (`PLAN_NL.md` §5.3 mục V3).
 */
export const CERTIFICATE_ROLE_OPTIONS: readonly ReferenceOption[] = [
  { code: "CHU_SU_DUNG", label: "Chủ sử dụng" },
  { code: "DONG_SU_DUNG", label: "Đồng sử dụng" },
  { code: "DAI_DIEN_HO", label: "Người đại diện hộ gia đình" },
  { code: "DAI_DIEN_TO_CHUC", label: "Người đại diện tổ chức" },
];

/** Trường 13 — loại tài sản gắn liền với đất. TẠM. */
export const ASSET_TYPE_OPTIONS: readonly ReferenceOption[] = [
  { code: "NHA_O", label: "Nhà ở" },
  { code: "CONG_TRINH", label: "Công trình xây dựng khác" },
  { code: "CAY_LAU_NAM", label: "Cây lâu năm" },
  { code: "RUNG_TRONG", label: "Rừng trồng sản xuất" },
];

/** Mười tổ dân phố cố định — dùng làm gợi ý, cán bộ mới là người chốt khi duyệt. */
export const NEIGHBORHOOD_HINTS: readonly string[] = [
  "Hà Thạch",
  "Lũng Thượng",
  "Phú An",
  "Phú Cường",
  "Phú Điền",
  "Phú Hộ",
  "Phú Lợi",
  "Phú Xuân",
  "Phúc Lợi",
  "Thống Nhất",
];
