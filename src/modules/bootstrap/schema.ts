import { CaseStatus, NEIGHBORHOODS, UserRole } from "@/modules/common/domain";

export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_ROOT_NAME = "CSDL-DAT-DAI-PHONG-CHAU-THU-NGHIEM";
export const SPREADSHEET_TITLE = "CSDL đất đai Phường Phong Châu - Thử nghiệm";

export interface SheetDefinition {
  readonly title: string;
  readonly headers: readonly string[];
}

export const SHEET_DEFINITIONS: readonly SheetDefinition[] = [
  {
    title: "CASES",
    headers: [
      "case_id",
      "neighborhood_code",
      "neighborhood_name",
      "status",
      "intake_officer_email",
      "assigned_reviewer_email",
      "received_at",
      "updated_at",
      "notes",
      "version",
      "drive_folder_id",
    ],
  },
  {
    title: "CERTIFICATES",
    headers: [
      "certificate_id",
      "case_id",
      "issue_number",
      "issue_date",
      "registry_number",
      "land_user_name",
      "notes",
      "created_at",
      "updated_at",
    ],
  },
  {
    title: "OWNERS",
    headers: [
      "owner_id",
      "case_id",
      "full_name",
      "citizen_id",
      "date_of_birth",
      "gender",
      "address",
      "source",
      "created_at",
      "updated_at",
    ],
  },
  {
    title: "FILES",
    headers: [
      "file_id",
      "case_id",
      "document_type",
      "variant",
      "drive_file_id",
      "mime_type",
      "size_bytes",
      "checksum_sha256",
      "status",
      "created_at",
      "updated_at",
      "owner_id",
    ],
  },
  {
    title: "IDENTITY_QR_SCANS",
    headers: [
      "scan_id",
      "case_id",
      "citizen_id",
      "full_name",
      "date_of_birth",
      "gender",
      "address",
      "payload_hash",
      "decoder_version",
      "parser_version",
      "status",
      "confirmed_by",
      "confirmed_at",
      "owner_id",
    ],
  },
  {
    title: "USERS",
    headers: ["email", "role", "active", "display_name", "created_at", "updated_at"],
  },
  {
    title: "REFERENCE_DATA",
    headers: ["category", "code", "label", "active", "sort_order"],
  },
  {
    title: "AUDIT_LOGS",
    headers: [
      "audit_id",
      "occurred_at",
      "actor_email",
      "action",
      "entity_type",
      "entity_id",
      "request_id",
      "metadata",
    ],
  },
  {
    title: "ID_RESERVATIONS",
    headers: ["reservation_id", "year", "created_at", "request_id", "actor_email"],
  },
  {
    title: "REQUEST_LOG",
    headers: ["idempotency_key", "request_id", "response_json", "created_at", "expires_at"],
  },
  {
    title: "SEARCH_INDEX",
    headers: ["index_id", "case_id", "field", "value_hash", "updated_at"],
  },
  { title: "PARCELS", headers: ["parcel_id", "case_id", "created_at", "updated_at"] },
  { title: "ASSETS", headers: ["asset_id", "case_id", "created_at", "updated_at"] },
  { title: "OCR_FIELDS", headers: ["ocr_field_id", "case_id", "created_at", "updated_at"] },
] as const;

/**
 * Khu vực chờ của cổng kê khai công khai — tách hẳn khỏi các tab hồ sơ chính thức
 * (`CASES`, `CERTIFICATES`, ...). Cán bộ chấp nhận mới sinh `CASE`.
 *
 * Nháp lưu dạng JSON trong `draft_json` của `PUBLIC_SUBMISSIONS`: nháp bị sửa liên tục, nếu
 * chuẩn hóa ngay từ đầu thì mỗi lần autosave phải xóa/ghi lại nhiều dòng ở năm tab. Chỉ khi
 * người dân bấm Gửi mới trải phẳng ra các tab con — lúc đó dữ liệu mới ổn định. Cách này giữ
 * số lần ghi Sheets ở mức thấp, vốn là trần thật của hệ thống (PLAN_NL §9.1).
 */
export const PUBLIC_SHEET_DEFINITIONS: readonly SheetDefinition[] = [
  {
    title: "PUBLIC_SUBMISSIONS",
    headers: [
      "submission_id",
      "receipt_code",
      "status",
      "phone",
      "version",
      "access_code_hash",
      "failed_attempts",
      "locked_until",
      "consent_version",
      "consented_at",
      "retention_until",
      "official_case_id",
      "drive_folder_id",
      "accept_step",
      "claimed_by",
      "claimed_at",
      "created_at",
      "updated_at",
      "draft_json",
    ],
  },
  {
    title: "PUBLIC_CERTIFICATES",
    headers: [
      "certificate_id",
      "submission_id",
      "issue_number",
      "issue_date",
      "registry_number",
      "created_at",
    ],
  },
  {
    title: "PUBLIC_OWNERS",
    headers: [
      "owner_id",
      "submission_id",
      "owner_type",
      "full_name",
      "identity_number",
      "role_on_certificate",
      "created_at",
      "date_of_birth",
      "gender",
      "residence_address",
      "identity_source",
      "qr_payload_hash",
      "qr_decoder_version",
      "qr_parser_version",
      "identity_status",
      "identity_confirmed_at",
    ],
  },
  {
    title: "PUBLIC_PARCELS",
    headers: [
      "parcel_id",
      "submission_id",
      "parcel_id_code",
      "map_sheet_number",
      "parcel_number",
      "address_on_certificate",
      "neighborhood_hint",
      "area",
      "created_at",
      // Đơn vị hành chính cũ nơi cấp GCN. Bắt buộc để quy đổi số tờ bản đồ sang bản đồ Phong Châu
      // mới (trường 19 của PL3): cả ba xã cũ đều đánh số tờ từ 1 nên thiếu cột này thì cùng một
      // số tờ ra ba kết quả khác nhau. Thêm ở CUỐI để không dịch cột của dữ liệu đã có.
      "old_ward",
    ],
  },
  {
    title: "PUBLIC_LAND_USES",
    headers: [
      "land_use_id",
      "submission_id",
      "parcel_id",
      "purpose_code",
      "origin_code",
      "form_code",
      "term_code",
      "area",
      "created_at",
    ],
  },
  {
    title: "PUBLIC_ASSETS",
    headers: ["asset_id", "submission_id", "asset_type", "description", "created_at"],
  },
  {
    title: "PUBLIC_FILES",
    headers: [
      "file_id",
      "submission_id",
      "document_type",
      "variant",
      "drive_file_id",
      "mime_type",
      "size_bytes",
      "checksum_sha256",
      "status",
      "created_at",
      "updated_at",
      "owner_id",
    ],
  },
] as const;

export const PUBLIC_SHEET_TITLES = PUBLIC_SHEET_DEFINITIONS.map(({ title }) => title);

export const NEIGHBORHOOD_CODES = [
  "HA_THACH",
  "LUNG_THUONG",
  "PHU_AN",
  "PHU_CUONG",
  "PHU_DIEN",
  "PHU_HO",
  "PHU_LOI",
  "PHU_XUAN",
  "PHUC_LOI",
  "THONG_NHAT",
] as const;

export const REQUIRED_SHEET_TITLES = SHEET_DEFINITIONS.map(({ title }) => title);

export function createReferenceDataRows(): string[][] {
  const neighborhoodRows = NEIGHBORHOODS.map((name, index) => [
    "NEIGHBORHOOD",
    NEIGHBORHOOD_CODES[index],
    name,
    "TRUE",
    String(index + 1),
  ]);
  const caseStatusRows = Object.values(CaseStatus).map((status, index) => [
    "CASE_STATUS",
    status,
    status,
    "TRUE",
    String(index + 1),
  ]);
  const roleRows = Object.values(UserRole).map((role, index) => [
    "USER_ROLE",
    role,
    role,
    "TRUE",
    String(index + 1),
  ]);

  return [...neighborhoodRows, ...caseStatusRows, ...roleRows];
}
