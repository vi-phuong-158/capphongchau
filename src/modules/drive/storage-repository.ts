/**
 * Ranh giới thao tác lưu trữ. M1 sẽ hiện thực bằng Google My Drive qua OAuth;
 * service nghiệp vụ không được gọi Google API trực tiếp.
 */
export interface StorageRepository {
  readonly provider: "google-my-drive";
}
