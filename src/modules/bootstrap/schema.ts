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
