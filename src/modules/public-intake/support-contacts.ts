/**
 * Danh bạ cán bộ hỗ trợ kê khai theo tổ dân phố.
 *
 * Đây là thông tin liên hệ công vụ, cố ý hiển thị công khai cho người dân — khác với PII của người
 * kê khai. Khi cán bộ phụ trách thay đổi, sửa đúng tệp này; không rải số điện thoại vào JSX.
 *
 * Nguồn: danh sách do chủ dự án cung cấp ngày 2026-07-22; hai số còn thiếu/trùng ở bản gốc
 * (Dương Văn Dũng, Hoàng Minh Trung) đã được chủ dự án bổ sung/sửa cùng ngày.
 */

export interface SupportContact {
  /** Tên tổ dân phố, khớp với `NEIGHBORHOOD_HINTS` trong `reference.ts`. */
  readonly neighborhood: string;
  /** Các khu thuộc tổ dân phố, giúp người dân tự nhận ra mình thuộc đầu mối nào. */
  readonly areas: string;
  readonly officerName: string;
  /** Rỗng nghĩa là chưa có số — giao diện sẽ chỉ hiện tên. */
  readonly phone: string;
}

/** Đầu mối tư vấn chung, dùng cho mọi trường hợp không rõ thuộc tổ nào. */
export const GENERAL_SUPPORT_CONTACT = {
  officerName: "Hoàng Thanh Sơn",
  phone: "0962570935",
  role: "Tư vấn chung",
} as const;

export const SUPPORT_CONTACTS: readonly SupportContact[] = [
  {
    neighborhood: "Phú An",
    areas: "khu Phú Cường, Phú Hà, Phú An",
    officerName: "Hoàng Minh Trung",
    phone: "0375998437",
  },
  {
    neighborhood: "Phú Lợi",
    areas: "khu Phú Lợi",
    officerName: "Hoàng Minh Trung",
    phone: "0375998437",
  },
  {
    neighborhood: "Hà Thạch",
    areas: "khu Ngọc Tháp, Hùng Thao, Hoàng Phú Thịnh, Ngũ Phúc",
    officerName: "Dương Văn Dũng",
    phone: "0964216333",
  },
  {
    neighborhood: "Lũng Thượng",
    areas: "khu Lũng Thượng",
    officerName: "Đỗ Thị Thu Hằng",
    phone: "0976896083",
  },
  {
    neighborhood: "Phú Hộ",
    areas: "khu 9, khu 10",
    officerName: "Nguyễn Xuân Huy",
    phone: "0989259186",
  },
  {
    neighborhood: "Phú Xuân",
    areas: "khu 7, 11, 12, 13",
    officerName: "Vũ Đình Lâm",
    phone: "0962558662",
  },
  {
    neighborhood: "Phú Điền",
    areas: "khu 4, khu 8",
    officerName: "Vũ Đình Lâm",
    phone: "0962558662",
  },
  {
    neighborhood: "Thống Nhất",
    areas: "khu 1, 2, 3",
    officerName: "Lê Minh Tiến",
    phone: "0984355665",
  },
];

/** Phạm vi áp dụng của phần mềm, hiển thị cho người dân trước khi họ mất công kê khai. */
export const COVERAGE_NOTICE =
  "Phần mềm chỉ áp dụng đối với các thửa đất trên địa bàn phường Phong Châu " +
  "(xã Phú Hộ, Hà Thạch và phường Phong Châu cũ).";
