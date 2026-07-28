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

/** Mục A, Phụ lục II Thông tư 08/2024/TT-BTNMT (các mã thường dùng). */
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

/**
 * Hai lối thoát cho loại đất, đặt ngoài danh mục pháp lý ở trên.
 *
 * GCN cũ thường ghi loại đất bằng thuật ngữ dân dã ("đất thổ cư", "đất vườn") không có mã trong
 * Thông tư 08/2024, còn người dân nhiều khi không tự phân loại được. Thiếu hai lối thoát này thì
 * người dân buộc phải chọn bừa một mã sai, tệ hơn là bỏ dở.
 *
 * - `GHI_THEO_BIA` — người dân nhập nguyên văn chữ trên bìa vào ô tự do; khi xuất PL3 ghi thẳng
 *   chữ đó (đúng tinh thần "ghi theo bìa").
 * - `CAN_DOI_CHIEU` — người dân không chắc; ô loại đất khi xuất để trống kèm cảnh báo cho cán bộ
 *   đối chiếu, không đoán bừa.
 */
export const LAND_PURPOSE_GHI_THEO_BIA = "GHI_THEO_BIA";
export const LAND_PURPOSE_CAN_DOI_CHIEU = "CAN_DOI_CHIEU";

export const LAND_PURPOSE_FALLBACK_OPTIONS: readonly ReferenceOption[] = [
  { code: LAND_PURPOSE_GHI_THEO_BIA, label: "Không tìm thấy — ghi theo bìa Giấy chứng nhận" },
  { code: LAND_PURPOSE_CAN_DOI_CHIEU, label: "Tôi không chắc — đề nghị cán bộ đối chiếu" },
];

/** Danh mục đầy đủ hiển thị trong ô chọn loại đất: danh mục pháp lý + hai lối thoát ở cuối. */
export const LAND_PURPOSE_SELECT_OPTIONS: readonly ReferenceOption[] = [
  ...LAND_PURPOSE_OPTIONS,
  ...LAND_PURPOSE_FALLBACK_OPTIONS,
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

/**
 * Trường 13 của PL3 — "Vai trò pháp nhân trên GCN".
 *
 * Sáu giá trị lấy nguyên từ ràng buộc dữ liệu nhúng trong `Tai lieu/PL3.xlsx`, thay cho bộ bốn mã
 * tự đặt trước 2026-07-22 (`CHU_SU_DUNG`/`DONG_SU_DUNG`/`DAI_DIEN_HO`/`DAI_DIEN_TO_CHUC`) vốn
 * **không trùng giá trị nào** của PL3. `label` chính là chuỗi phải ghi ra khi xuất.
 */
export const CERTIFICATE_ROLE_OPTIONS: readonly ReferenceOption[] = [
  { code: "CA_NHAN", label: "Cá nhân" },
  { code: "CHU_HO", label: "Chủ hộ" },
  { code: "CHONG", label: "Chồng" },
  { code: "VO", label: "Vợ" },
  { code: "NGUOI_DAI_DIEN", label: "Người đại diện" },
  { code: "THANH_VIEN", label: "Thành viên" },
];

export const CERTIFICATE_ROLE_CODES: readonly string[] = CERTIFICATE_ROLE_OPTIONS.map(
  (option) => option.code,
);

/**
 * Bốn mã cũ đã nằm trong các hồ sơ nộp trước 2026-07-22. Ánh xạ sang giá trị PL3 gần nhất để hồ sơ
 * cũ vẫn xuất được, thay vì trở thành giá trị lạ giữa file nộp.
 *
 * `DONG_SU_DUNG` là ca duy nhất không khớp một-một: PL3 xếp "Đồng sử dụng" vào **trường 12**
 * (pháp nhân) chứ không phải trường 13, nên vai trò tương ứng là `Thành viên`. Cán bộ duyệt cần
 * xem lại các hồ sơ này.
 */
export const LEGACY_CERTIFICATE_ROLE_CODES: Readonly<Record<string, string>> = {
  CHU_SU_DUNG: "CA_NHAN",
  DONG_SU_DUNG: "THANH_VIEN",
  DAI_DIEN_HO: "CHU_HO",
  DAI_DIEN_TO_CHUC: "NGUOI_DAI_DIEN",
};

/** Trả mã PL3 hợp lệ, hoặc `""` nếu không nhận ra — không đoán bừa. */
export function normalizeCertificateRole(code: string): string {
  const trimmed = code.trim();
  if (CERTIFICATE_ROLE_CODES.includes(trimmed)) return trimmed;
  return LEGACY_CERTIFICATE_ROLE_CODES[trimmed] ?? "";
}

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

/**
 * Trường 15 của PL3 — "Lý do thay đổi" khi người sử dụng hiện tại khác người trên GCN. Nhãn ghi
 * thẳng ra file nộp. Danh mục rút từ gợi ý trong tiêu đề PL3 ("thừa kế, tặng cho, chuyển nhượng...")
 * kèm lối thoát "Khác" cho các trường hợp còn lại.
 */
export const CHANGE_REASON_OPTIONS: readonly ReferenceOption[] = [
  { code: "THUA_KE", label: "Thừa kế" },
  { code: "TANG_CHO", label: "Tặng cho" },
  { code: "CHUYEN_NHUONG", label: "Chuyển nhượng" },
  { code: "KHAC", label: "Khác" },
];

export const CHANGE_REASON_CODES: readonly string[] = CHANGE_REASON_OPTIONS.map(
  (option) => option.code,
);

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

/**
 * Lối thoát cho ô "Tổ dân phố nơi có thửa đất".
 *
 * Cần thiết vì người có đất ở Phong Châu nhưng đang cư trú nơi khác không biết thửa của mình
 * thuộc tổ nào — trước đây ô này để trống thì không phân biệt được với "chưa ai đụng tới", còn
 * người dân thì đoán bừa một tổ. Chọn tường minh là chưa xác định thì cán bộ biết phải tra.
 */
export const NEIGHBORHOOD_UNKNOWN = "CHUA_XAC_DINH";

export const NEIGHBORHOOD_OPTIONS: readonly ReferenceOption[] = [
  ...NEIGHBORHOOD_HINTS.map((name) => ({ code: name, label: name })),
  { code: NEIGHBORHOOD_UNKNOWN, label: "Chưa xác định — cán bộ sẽ tra giúp" },
];
