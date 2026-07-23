/**
 * Ranh giới dữ liệu cấu trúc. Runtime hiện thực bằng Supabase PostgreSQL;
 * service nghiệp vụ không được gọi database trực tiếp.
 */
export interface DataRepository {
  readonly provider: "supabase-postgres";
}
