/**
 * CẤU HÌNH HỆ THỐNG KÊ KHAI DỰ PHÒNG
 *
 * Chỉ cần sửa các giá trị trong APP_CONFIG trước khi chạy setupSystem().
 */
const APP_CONFIG = Object.freeze({
  APP_NAME: "Kê khai hồ sơ đất đai dự phòng",
  UNIT_NAME: "ỦY BAN NHÂN DÂN PHƯỜNG PHONG CHÂU",
  PAGE_TITLE: "Kê khai dự phòng - UBND Phường Phong Châu",
  SUPPORT_OFFICER: "Hoàng Thanh Sơn",
  SUPPORT_PHONE: "0962570935",
  COVERAGE_NOTICE:
    "Chỉ áp dụng đối với các thửa đất trên địa bàn phường Phong Châu " +
    "(xã Phú Hộ, Hà Thạch và phường Phong Châu cũ).",

  // Có thể điền ID thư mục Drive cha. Để trống sẽ tạo trong My Drive.
  ROOT_PARENT_FOLDER_ID: "",
  ROOT_FOLDER_NAME: "HỒ SƠ KÊ KHAI DỰ PHÒNG - PHONG CHÂU",
  SPREADSHEET_NAME: "DANH SÁCH HỒ SƠ KÊ KHAI DỰ PHÒNG",
  SUBMISSIONS_SHEET_NAME: "HO_SO_DU_PHONG",
  FILES_SHEET_NAME: "NHAT_KY_TEP",
  GUIDE_SHEET_NAME: "HUONG_DAN",

  TIME_ZONE: "Asia/Bangkok",
  CLIENT_VERSION: "1.0.0",

  // Hệ thống mặc định tắt sau khi cài đặt. Chạy enableEmergencyMode() để bật.
  ENABLED_AFTER_SETUP: false,

  // Giới hạn hồ sơ/ảnh để tránh nghẽn và lạm dụng.
  MAX_CERTIFICATES_PER_SUBMISSION: 5,
  MAX_IMAGES_PER_CERTIFICATE: 12,
  MAX_TOTAL_FILES: 50,
  MAX_FILE_BYTES: 6 * 1024 * 1024,
  MAX_RAW_CLIENT_FILE_BYTES: 20 * 1024 * 1024,

  // Chống gửi tự động cơ bản.
  MIN_FORM_AGE_SECONDS: 4,
  MAX_STARTS_PER_PHONE_PER_HOUR: 5,
  MAX_STARTS_PER_DEVICE_PER_HOUR: 5,
  MAX_STARTS_PER_PHONE_PER_DAY: 10,
  MAX_STARTS_PER_DEVICE_PER_DAY: 10,
  RATE_LIMIT_SCAN_ROWS: 1000,

  // Hồ sơ tải dở quá thời hạn sẽ bị chuyển vào thùng rác.
  ABANDONED_SUBMISSION_HOURS: 24,

  // Nội dung xác nhận hiển thị trên giao diện.
  CONSENT_TEXT:
    "Tôi đồng ý cung cấp thông tin và hình ảnh giấy tờ để phục vụ công tác làm sạch, " +
    "đối chiếu và hoàn thiện CSDL đất đai tại phường Phong Châu.",
});

const PROPERTY_KEYS = Object.freeze({
  ROOT_FOLDER_ID: "ROOT_FOLDER_ID",
  SPREADSHEET_ID: "SPREADSHEET_ID",
  SYSTEM_ENABLED: "SYSTEM_ENABLED",
  SETUP_AT: "SETUP_AT",
});

const STATUS = Object.freeze({
  UPLOADING: "ĐANG TẢI ẢNH",
  RECEIVED: "ĐÃ TIẾP NHẬN",
  CANCELLED: "NGƯỜI DÙNG HỦY",
  EXPIRED: "HẾT HẠN TẢI DỞ",
  ERROR: "LỖI",
});

const SYNC_STATUS = Object.freeze({
  PENDING: "CHƯA ĐỒNG BỘ",
  PROCESSING: "ĐANG ĐỒNG BỘ",
  DONE: "ĐÃ ĐỒNG BỘ",
  DUPLICATE: "HỒ SƠ TRÙNG",
  NEED_CONTACT: "CẦN LIÊN HỆ BỔ SUNG",
});

const SUBMISSION_HEADERS = Object.freeze([
  "Mã hồ sơ",
  "Thời gian bắt đầu",
  "Thời gian hoàn tất",
  "Trạng thái tiếp nhận",
  "Họ và tên",
  "Số điện thoại",
  "Số CCCD",
  "Địa chỉ liên hệ",
  "Số lượng GCN",
  "Ghi chú của người dân",
  "Số ảnh CCCD",
  "Số ảnh GCN",
  "Thư mục hồ sơ",
  "Trạng thái đồng bộ",
  "Cán bộ xử lý",
  "Ghi chú nội bộ",
  "Đã đồng ý cung cấp dữ liệu",
  "Đã xác nhận tải đủ ảnh",
  "__DeviceId",
  "__TokenHash",
  "__FolderId",
  "__StartedEpoch",
  "__LastActivityEpoch",
  "__ClientVersion",
  "__UserAgent",
  "__Lỗi gần nhất",
]);

const FILE_HEADERS = Object.freeze([
  "Mã hồ sơ",
  "Nhóm tệp",
  "GCN số",
  "STT ảnh",
  "Tên tệp",
  "Loại MIME",
  "Dung lượng (byte)",
  "SHA-256",
  "Drive File ID",
  "Thời gian tải",
  "Trạng thái",
]);

const SUB_COL = Object.freeze({
  ID: 1,
  STARTED_AT: 2,
  COMPLETED_AT: 3,
  STATUS: 4,
  FULL_NAME: 5,
  PHONE: 6,
  CITIZEN_ID: 7,
  ADDRESS: 8,
  CERT_COUNT: 9,
  NOTE: 10,
  CCCD_IMAGE_COUNT: 11,
  GCN_IMAGE_COUNT: 12,
  FOLDER_LINK: 13,
  SYNC_STATUS: 14,
  OFFICER: 15,
  INTERNAL_NOTE: 16,
  CONSENT: 17,
  COMPLETE_IMAGES: 18,
  DEVICE_ID: 19,
  TOKEN_HASH: 20,
  FOLDER_ID: 21,
  STARTED_EPOCH: 22,
  LAST_ACTIVITY_EPOCH: 23,
  CLIENT_VERSION: 24,
  USER_AGENT: 25,
  LAST_ERROR: 26,
});
