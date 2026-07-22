/**
 * Danh mục loại đất lấy từ Mục A, Phụ lục II Thông tư 08/2024/TT-BTNMT,
 * hiệu lực từ 01/08/2024. Nguồn Công báo điện tử Chính phủ:
 * https://congbao.chinhphu.vn/van-ban/thong-tu-so-08-2024-tt-btnmt-42595/51505.htm
 *
 * Các nhóm nguồn gốc, hình thức và thời hạn là mã nội bộ ổn định, có nhãn
 * theo thuật ngữ pháp luật. Chúng có thể được map sang danh mục trao đổi dữ
 * liệu riêng của VPĐKĐĐ trong tương lai mà không phải sửa hồ sơ gốc.
 */
export const REFERENCE_IS_PLACEHOLDER = false;
export const REFERENCE_CATALOG_VERSION = "TT08-2024-BTNMT/2026-07-21";

export interface ReferenceOption {
  readonly code: string;
  readonly label: string;
}

/** Mục A, Phụ lục II Thông tư 08/2024/TT-BTNMT (các mã dùng cho bản demo). */
export const LAND_PURPOSE_OPTIONS: readonly ReferenceOption[] = [
  { code: "LUC", label: "Đất chuyên trồng lúa" },
  { code: "LUK", label: "Đất trồng lúa còn lại" },
  { code: "HNK", label: "Đất trồng cây hằng năm khác" },
  { code: "CLN", label: "Đất trồng cây lâu năm" },
  { code: "RDD", label: "Đất rừng đặc dụng" },
  { code: "RPH", label: "Đất rừng phòng hộ" },
  { code: "RSX", label: "Đất rừng sản xuất" },
  { code: "NTS", label: "Đất nuôi trồng thủy sản" },
  { code: "CNT", label: "Đất chăn nuôi tập trung" },
  { code: "LMU", label: "Đất làm muối" },
  { code: "NKH", label: "Đất nông nghiệp khác" },
  { code: "ONT", label: "Đất ở tại nông thôn" },
  { code: "ODT", label: "Đất ở tại đô thị" },
  { code: "TSC", label: "Đất xây dựng trụ sở cơ quan" },
  { code: "CQP", label: "Đất quốc phòng" },
  { code: "CAN", label: "Đất an ninh" },
  { code: "DVH", label: "Đất xây dựng cơ sở văn hóa" },
  { code: "DYT", label: "Đất xây dựng cơ sở y tế" },
  { code: "DGD", label: "Đất xây dựng cơ sở giáo dục và đào tạo" },
  { code: "DTT", label: "Đất xây dựng cơ sở thể dục thể thao" },
  { code: "DKH", label: "Đất xây dựng cơ sở khoa học và công nghệ" },
  { code: "DSK", label: "Đất xây dựng cơ sở dịch vụ xã hội" },
  { code: "DSO", label: "Đất xây dựng cơ sở khác" },
  { code: "CSK", label: "Đất khu công nghiệp, cụm công nghiệp" },
  { code: "TMD", label: "Đất thương mại, dịch vụ" },
  { code: "SKC", label: "Đất cơ sở sản xuất phi nông nghiệp" },
  { code: "SKS", label: "Đất sử dụng cho hoạt động khoáng sản" },
  { code: "SKN", label: "Đất sản xuất vật liệu xây dựng, làm đồ gốm" },
  { code: "DGT", label: "Đất giao thông" },
  { code: "DTL", label: "Đất thủy lợi" },
  { code: "DDT", label: "Đất có di tích lịch sử - văn hóa" },
  { code: "DRA", label: "Đất bãi thải, xử lý chất thải" },
  { code: "DCK", label: "Đất công trình công cộng khác" },
  { code: "DPC", label: "Đất sinh hoạt cộng đồng" },
  { code: "DSH", label: "Đất khu vui chơi, giải trí công cộng" },
  { code: "DNL", label: "Đất công trình năng lượng, chiếu sáng công cộng" },
  { code: "DNG", label: "Đất công trình công cộng có hành lang bảo vệ an toàn" },
  { code: "TON", label: "Đất cơ sở tôn giáo" },
  { code: "TIN", label: "Đất cơ sở tín ngưỡng" },
  { code: "SON", label: "Đất sông, ngòi, kênh, rạch, suối" },
  { code: "MNC", label: "Đất có mặt nước chuyên dùng" },
  { code: "PNK", label: "Đất phi nông nghiệp khác" },
  { code: "BCS", label: "Đất bằng chưa sử dụng" },
  { code: "DCS", label: "Đất đồi núi chưa sử dụng" },
  { code: "NCS", label: "Núi đá không có rừng cây" },
];

export const LAND_ORIGIN_OPTIONS: readonly ReferenceOption[] = [
  { code: "NHA_NUOC_GIAO_CO_THU", label: "Nhà nước giao đất có thu tiền sử dụng đất" },
  { code: "NHA_NUOC_GIAO_KHONG_THU", label: "Nhà nước giao đất không thu tiền sử dụng đất" },
  { code: "NHA_NUOC_CONG_NHAN", label: "Nhà nước công nhận quyền sử dụng đất" },
  { code: "NHA_NUOC_CHO_THUE", label: "Nhà nước cho thuê đất" },
  { code: "NHAN_CHUYEN_QUYEN", label: "Nhận chuyển quyền sử dụng đất" },
  { code: "THUA_KE_TANG_CHO", label: "Thừa kế, tặng cho quyền sử dụng đất" },
  { code: "NGUON_GOC_KHAC", label: "Nguồn gốc khác (ghi rõ khi chuẩn hóa)" },
];

export const LAND_USE_FORM_OPTIONS: readonly ReferenceOption[] = [
  { code: "SU_DUNG_RIENG", label: "Sử dụng riêng" },
  { code: "SU_DUNG_CHUNG", label: "Sử dụng chung" },
  { code: "SU_DUNG_RIENG_VA_CHUNG", label: "Sử dụng riêng và sử dụng chung" },
];

export const LAND_USE_TERM_OPTIONS: readonly ReferenceOption[] = [
  { code: "SU_DUNG_ON_DINH_LAU_DAI", label: "Sử dụng ổn định lâu dài" },
  { code: "SU_DUNG_CO_THOI_HAN", label: "Sử dụng có thời hạn (ghi rõ đến ngày trên GCN)" },
];

/** Trường 13 — loại tài sản gắn liền với đất. */
export const ASSET_TYPE_OPTIONS: readonly ReferenceOption[] = [
  { code: "NHA_O", label: "Nhà ở" },
  { code: "CONG_TRINH", label: "Công trình xây dựng khác" },
  { code: "CAY_LAU_NAM", label: "Cây lâu năm" },
  { code: "RUNG_TRONG", label: "Rừng trồng sản xuất" },
];

/** Trường 7 — nội hàm vẫn cần cán bộ nghiệp vụ xác nhận khi dùng dữ liệu thật. */
export const CERTIFICATE_ROLE_OPTIONS: readonly ReferenceOption[] = [
  { code: "CHU_SU_DUNG", label: "Chủ sử dụng" },
  { code: "DONG_SU_DUNG", label: "Đồng sử dụng" },
  { code: "DAI_DIEN_HO", label: "Người đại diện hộ gia đình" },
  { code: "DAI_DIEN_TO_CHUC", label: "Người đại diện tổ chức" },
];

/**
 * Đơn vị hành chính cũ nơi cấp GCN. Mã trùng `OldWard` trong `map-sheet-reference.ts`, thêm
 * `KHONG_RO` làm lối thoát cho người dân không đọc được tên xã cũ trên bìa GCN.
 *
 * Cần thiết vì ba xã cũ đều đánh số tờ bản đồ từ 1: thiếu trường này thì không quy đổi được số tờ
 * sang bản đồ Phong Châu mới (trường 19 của PL3).
 */
export const OLD_WARD_OPTIONS: readonly ReferenceOption[] = [
  { code: "PHU_HO", label: "Xã Phú Hộ (cũ)" },
  { code: "HA_THACH", label: "Xã Hà Thạch (cũ)" },
  { code: "PHONG_CHAU_CU", label: "Phường Phong Châu (cũ)" },
  { code: "KHONG_RO", label: "Không rõ — đề nghị cán bộ xác định" },
];

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
