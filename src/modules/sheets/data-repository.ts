/**
 * Ranh giới dữ liệu cấu trúc. M1 sẽ hiện thực bằng Google Sheets batch API;
 * service nghiệp vụ không được gọi Google API trực tiếp.
 */
export interface DataRepository {
  readonly provider: "google-sheets";
}
