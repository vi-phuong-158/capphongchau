/**
 * One-time ETL from the legacy Google Sheets workbook to Supabase/PostgreSQL.
 *
 * Prerequisites:
 *   1. Apply `supabase/migrations/*` to the target project.
 *   2. Set SUPABASE_DATABASE_URL and the legacy Google OAuth/Sheets variables.
 *   3. Back up the workbook, then run `npm run migrate:sheets-to-supabase`.
 *
 * The import reads Sheets first and writes all PostgreSQL rows plus an import marker in one
 * transaction. A successful workbook cannot be imported twice by this command.
 */
import { createHash, randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";
import type { sheets_v4 } from "googleapis";
import type { Sql } from "postgres";

import { loadLegacyGoogleSheetsEnvironment } from "@/modules/common/env";
import { createGoogleWorkspaceClient } from "@/modules/google/workspace-client";
import { getDatabase } from "@/modules/supabase/database";

type RawRow = Readonly<Record<string, string>>;
type JsonValue = Record<string, unknown> | readonly unknown[];
type DatabaseValue = string | number | boolean | readonly string[] | JsonValue | null;
type MappedRow = Readonly<Record<string, DatabaseValue | undefined>>;

interface ImportSpec {
  readonly sheet: string;
  readonly table: string;
  readonly map: (row: RawRow, sheetRow: number) => MappedRow;
}

const text = (row: RawRow, key: string): string => row[key]?.trim() ?? "";
const optional = (row: RawRow, key: string): string | undefined => text(row, key) || undefined;
const legacyPhone = (row: RawRow, key: string): string => {
  const raw = text(row, key);
  if (!raw) return "";
  const digits = raw.replace(/[^0-9]/g, "");
  if (/^0[0-9]{9}$/.test(digits)) return digits;
  if (/^84[0-9]{9}$/.test(digits)) return `0${digits.slice(2)}`;
  return "";
};
const integer = (row: RawRow, key: string): number | undefined => {
  const raw = text(row, key);
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${key} không phải số nguyên.`);
  return value;
};
const bool = (row: RawRow, key: string): boolean | undefined => {
  const raw = text(row, key).toLowerCase();
  if (!raw) return undefined;
  if (["true", "1", "yes"].includes(raw)) return true;
  if (["false", "0", "no"].includes(raw)) return false;
  throw new Error(`${key} không phải boolean.`);
};
const json = (
  row: RawRow,
  key: string,
): Record<string, unknown> | readonly unknown[] | undefined => {
  const raw = text(row, key);
  if (!raw) return undefined;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error(`${key} không phải JSON object/array.`);
  return value as Record<string, unknown> | readonly unknown[];
};
const direct =
  (...keys: readonly string[]) =>
  (row: RawRow): MappedRow =>
    Object.fromEntries(keys.map((key) => [key, text(row, key)]));

const OPTIONAL_LEGACY_SHEETS = new Set([
  "PUBLIC_CERTIFICATES",
  "PUBLIC_OWNERS",
  "PUBLIC_PARCELS",
  "PUBLIC_LAND_USES",
  "PUBLIC_ASSETS",
  "PUBLIC_STATUS_EVENTS",
  "PUBLIC_SUPPLEMENT_REQUESTS",
  "PUBLIC_SUPPLEMENT_ITEMS",
  "EXPORT_JOBS",
  "EXISTING_CERTIFICATES",
  "EXISTING_CERTIFICATE_OWNERS",
  "PUBLIC_EXISTING_RECORD_LINKS",
  "EXISTING_IMPORT_RUNS",
  "PUBLIC_LOOKUP_INDEX",
]);

function isMissingSheetError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Unable to parse range");
}
const IMPORT_SPECS: readonly ImportSpec[] = [
  {
    sheet: "USERS",
    table: "users",
    map: (row) => ({
      email: text(row, "email").toLowerCase(),
      roles: text(row, "role")
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean),
      active: bool(row, "active") ?? true,
      display_name: text(row, "display_name"),
      created_at: optional(row, "created_at"),
      updated_at: optional(row, "updated_at"),
    }),
  },
  {
    sheet: "AUDIT_LOGS",
    table: "audit_logs",
    map: (row) => ({
      ...direct("audit_id", "actor_email", "action", "entity_type", "entity_id", "request_id")(row),
      occurred_at: optional(row, "occurred_at"),
      metadata: json(row, "metadata") ?? {},
    }),
  },
  {
    sheet: "REQUEST_LOG",
    table: "request_log",
    map: (row) => {
      const response = json(row, "response_json") ?? {};
      return {
        idempotency_key: text(row, "idempotency_key"),
        request_id: text(row, "request_id"),
        kind: "LEGACY_SHEETS",
        mutation_hash: createHash("sha256").update(JSON.stringify(response)).digest("hex"),
        response_json: response,
        created_at: optional(row, "created_at"),
        expires_at: optional(row, "expires_at"),
      };
    },
  },
  {
    sheet: "PUBLIC_SUBMISSIONS",
    table: "public_submissions",
    map: (row, sheetRow) => ({
      ...direct(
        "submission_id",
        "receipt_code",
        "status",
        "access_code_hash",
        "consent_version",
        "drive_folder_id",
      )(row),
      phone: legacyPhone(row, "phone"),
      version: integer(row, "version") ?? 1,
      failed_attempts: integer(row, "failed_attempts") ?? 0,
      locked_until: optional(row, "locked_until"),
      consented_at: optional(row, "consented_at"),
      retention_until: optional(row, "retention_until"),
      official_case_id: optional(row, "official_case_id"),
      accept_step: optional(row, "accept_step"),
      claimed_by: optional(row, "claimed_by"),
      claimed_at: optional(row, "claimed_at"),
      created_at: optional(row, "created_at"),
      updated_at: optional(row, "updated_at"),
      draft_json: json(row, "draft_json"),
      access_version: integer(row, "access_version") ?? 1,
      file_summary_json: json(row, "file_summary_json") ?? [],
      legacy_row_index: sheetRow,
    }),
  },
  {
    sheet: "PUBLIC_FILES",
    table: "public_files",
    map: (row) => ({
      ...direct(
        "file_id",
        "submission_id",
        "document_type",
        "variant",
        "drive_file_id",
        "mime_type",
        "checksum_sha256",
        "status",
      )(row),
      owner_id: text(row, "owner_id"),
      size_bytes: integer(row, "size_bytes") ?? 0,
      file_name: text(row, "file_name"),
      created_at: optional(row, "created_at"),
      updated_at: optional(row, "updated_at"),
    }),
  },
  {
    sheet: "PUBLIC_STATUS_EVENTS",
    table: "public_status_events",
    map: (row) => ({
      ...direct(
        "event_id",
        "submission_id",
        "event_type",
        "actor_email",
        "actor_display_name",
        "request_id",
      )(row),
      label: text(row, "public_label"),
      message: text(row, "public_message"),
      occurred_at: optional(row, "occurred_at"),
    }),
  },
  {
    sheet: "PUBLIC_SUPPLEMENT_REQUESTS",
    table: "public_supplement_requests",
    map: (row) => ({
      supplement_request_id: text(row, "request_id"),
      ...direct(
        "submission_id",
        "status",
        "reason_code",
        "message",
        "requested_by_email",
        "requested_by_display_name",
      )(row),
      created_at: optional(row, "created_at"),
      resolved_at: optional(row, "resolved_at"),
    }),
  },
  {
    sheet: "PUBLIC_SUPPLEMENT_ITEMS",
    table: "public_supplement_items",
    map: (row) => ({
      item_id: text(row, "item_id"),
      supplement_request_id: text(row, "request_id"),
      ...direct(
        "submission_id",
        "item_type",
        "target_entity_type",
        "target_entity_id",
        "field_path",
        "reason_code",
        "instruction",
        "status",
      )(row),
      document_type: optional(row, "document_type"),
      created_at: optional(row, "created_at"),
      resolved_at: optional(row, "resolved_at"),
    }),
  },
  {
    sheet: "PUBLIC_CERTIFICATES",
    table: "public_certificates",
    map: (row) => ({
      ...direct(
        "certificate_id",
        "submission_id",
        "issue_number",
        "issue_date",
        "registry_number",
      )(row),
      created_at: optional(row, "created_at"),
    }),
  },
  {
    sheet: "PUBLIC_OWNERS",
    table: "public_owners",
    map: (row) => ({
      ...direct(
        "owner_id",
        "submission_id",
        "owner_type",
        "full_name",
        "identity_number",
        "role_on_certificate",
        "date_of_birth",
        "gender",
        "residence_address",
        "identity_source",
        "qr_payload_hash",
        "qr_decoder_version",
        "qr_parser_version",
        "identity_status",
        "identity_confirmed_at",
        "current_user_name",
        "current_user_citizen_id",
        "current_user_address",
        "change_reason",
      )(row),
      has_distinct_current_user: bool(row, "has_distinct_current_user") ?? false,
      created_at: optional(row, "created_at"),
    }),
  },
  {
    sheet: "PUBLIC_PARCELS",
    table: "public_parcels",
    map: (row) => ({
      ...direct(
        "parcel_id",
        "submission_id",
        "parcel_id_code",
        "map_sheet_number",
        "parcel_number",
        "address_on_certificate",
        "area",
        "old_ward",
      )(row),
      address_two_level: text(row, "neighborhood_hint"),
      created_at: optional(row, "created_at"),
    }),
  },
  {
    sheet: "PUBLIC_LAND_USES",
    table: "public_land_uses",
    map: (row) => ({
      ...direct(
        "land_use_id",
        "submission_id",
        "parcel_id",
        "purpose_code",
        "origin_code",
        "form_code",
        "term_code",
        "area",
      )(row),
      purpose_free_text: "",
      created_at: optional(row, "created_at"),
    }),
  },
  {
    sheet: "PUBLIC_ASSETS",
    table: "public_assets",
    map: (row) => ({
      ...direct("asset_id", "submission_id", "asset_type", "description")(row),
      created_at: optional(row, "created_at"),
    }),
  },
  {
    sheet: "EXISTING_CERTIFICATES",
    table: "existing_certificates",
    map: (row) => ({
      ...direct(
        "existing_record_id",
        "issue_number",
        "issue_number_normalized",
        "issue_date",
        "registry_number",
        "status",
      )(row),
      source_name: text(row, "import_id"),
      source_row: text(row, "source_rows"),
      imported_at: optional(row, "updated_at") ?? optional(row, "created_at"),
    }),
  },
  {
    sheet: "EXISTING_CERTIFICATE_OWNERS",
    table: "existing_certificate_owners",
    map: (row) => ({
      existing_owner_link_id: text(row, "link_id"),
      ...direct("existing_record_id", "citizen_id_hmac")(row),
      source_name: text(row, "import_id"),
      imported_at: optional(row, "created_at"),
    }),
  },
  {
    sheet: "PUBLIC_EXISTING_RECORD_LINKS",
    table: "public_existing_record_links",
    map: (row) => ({
      ...direct(
        "link_id",
        "submission_id",
        "owner_id",
        "existing_record_id",
        "outcome",
        "status",
      )(row),
      created_at: optional(row, "created_at"),
      updated_at: optional(row, "updated_at"),
    }),
  },
  {
    sheet: "EXISTING_IMPORT_RUNS",
    table: "existing_import_runs",
    map: (row) => ({
      import_run_id: text(row, "import_id"),
      source_sha256: text(row, "source_sha256"),
      status: text(row, "status"),
      source_name: text(row, "source_file_name"),
      stats_json: {
        totalRows: integer(row, "total_rows") ?? 0,
        validRows: integer(row, "valid_rows") ?? 0,
        invalidRows: integer(row, "invalid_rows") ?? 0,
        conflictRows: integer(row, "conflict_rows") ?? 0,
        duplicateRows: integer(row, "duplicate_rows") ?? 0,
        reportReference: text(row, "report_reference"),
      },
      created_at: optional(row, "started_at"),
      completed_at: optional(row, "completed_at"),
    }),
  },
  {
    sheet: "EXPORT_JOBS",
    table: "export_jobs",
    map: (row) => ({
      ...direct(
        "export_job_id",
        "export_type",
        "status",
        "drive_file_id",
        "file_name",
        "checksum_sha256",
        "actor_email",
      )(row),
      row_count: integer(row, "row_count") ?? 0,
      submission_count: integer(row, "submission_count") ?? 0,
      warning_count: integer(row, "warning_count") ?? 0,
      scope_json: json(row, "scope_json") ?? {},
      created_at: optional(row, "created_at"),
      completed_at: optional(row, "completed_at"),
    }),
  },
  {
    sheet: "CASES",
    table: "cases",
    map: (row) => ({
      ...direct(
        "case_id",
        "neighborhood_code",
        "neighborhood_name",
        "status",
        "notes",
        "drive_folder_id",
      )(row),
      intake_officer_email: optional(row, "intake_officer_email"),
      assigned_reviewer_email: optional(row, "assigned_reviewer_email"),
      received_at: optional(row, "received_at"),
      updated_at: optional(row, "updated_at"),
      version: integer(row, "version") ?? 1,
    }),
  },
  {
    sheet: "CERTIFICATES",
    table: "certificates",
    map: (row) => ({
      ...direct(
        "certificate_id",
        "case_id",
        "issue_number",
        "issue_date",
        "registry_number",
        "land_user_name",
        "notes",
      )(row),
      created_at: optional(row, "created_at"),
      updated_at: optional(row, "updated_at"),
    }),
  },
  {
    sheet: "OWNERS",
    table: "owners",
    map: (row) => ({
      ...direct(
        "owner_id",
        "case_id",
        "full_name",
        "citizen_id",
        "date_of_birth",
        "gender",
        "address",
        "source",
      )(row),
      created_at: optional(row, "created_at"),
      updated_at: optional(row, "updated_at"),
    }),
  },
  {
    sheet: "FILES",
    table: "files",
    map: (row) => ({
      ...direct(
        "file_id",
        "case_id",
        "document_type",
        "variant",
        "drive_file_id",
        "mime_type",
        "checksum_sha256",
        "status",
      )(row),
      owner_id: optional(row, "owner_id"),
      size_bytes: integer(row, "size_bytes") ?? 0,
      created_at: optional(row, "created_at"),
      updated_at: optional(row, "updated_at"),
    }),
  },
  {
    sheet: "IDENTITY_QR_SCANS",
    table: "identity_qr_scans",
    map: (row) => ({
      ...direct(
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
      )(row),
      owner_id: optional(row, "owner_id"),
      confirmed_by: optional(row, "confirmed_by"),
      confirmed_at: optional(row, "confirmed_at"),
    }),
  },
  {
    sheet: "REFERENCE_DATA",
    table: "reference_data",
    map: (row) => ({
      ...direct("category", "code", "label")(row),
      active: bool(row, "active") ?? true,
      sort_order: integer(row, "sort_order") ?? 0,
    }),
  },
  {
    sheet: "ID_RESERVATIONS",
    table: "id_reservations",
    map: (row) => ({
      year: integer(row, "year"),
      created_at: optional(row, "created_at"),
      request_id: text(row, "request_id"),
      actor_email: text(row, "actor_email"),
    }),
  },
  {
    sheet: "SEARCH_INDEX",
    table: "search_index",
    map: (row) => ({
      ...direct("index_id", "case_id", "field", "value_hash")(row),
      updated_at: optional(row, "updated_at"),
    }),
  },
  {
    sheet: "PARCELS",
    table: "parcels",
    map: (row) => ({
      parcel_id: text(row, "parcel_id"),
      case_id: text(row, "case_id"),
      data_json: row,
      created_at: optional(row, "created_at"),
      updated_at: optional(row, "updated_at"),
    }),
  },
  {
    sheet: "ASSETS",
    table: "assets",
    map: (row) => ({
      asset_id: text(row, "asset_id"),
      case_id: text(row, "case_id"),
      data_json: row,
      created_at: optional(row, "created_at"),
      updated_at: optional(row, "updated_at"),
    }),
  },
  {
    sheet: "OCR_FIELDS",
    table: "ocr_fields",
    map: (row) => ({
      ocr_field_id: text(row, "ocr_field_id"),
      case_id: optional(row, "case_id"),
      payload_json: row,
      created_at: optional(row, "created_at"),
      updated_at: optional(row, "updated_at"),
    }),
  },
] as const;

async function readSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheet: string,
): Promise<readonly { row: RawRow; sheetRow: number }[]> {
  let response: sheets_v4.Schema$ValueRange;
  try {
    response = (
      await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheet}'!1:10000`,
      })
    ).data;
  } catch (error) {
    if (OPTIONAL_LEGACY_SHEETS.has(sheet) && isMissingSheetError(error)) {
      console.log(`[skip] Tab extension chưa tồn tại: ${sheet}`);
      return [];
    }
    throw error;
  }
  const values = response.values ?? [];
  const headers = (values[0] ?? []).map((value) => String(value).trim());
  return values.slice(1).flatMap((cells, index) => {
    const row = Object.fromEntries(
      headers.map((header, column) => [header, String(cells[column] ?? "")]),
    );
    return Object.values(row).some((value) => value.trim()) ? [{ row, sheetRow: index + 2 }] : [];
  });
}

function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`Tên SQL không hợp lệ: ${value}`);
  return `"${value}"`;
}

async function insertRows(
  database: Sql,
  table: string,
  rows: readonly MappedRow[],
  ignoreConflict = false,
): Promise<void> {
  const chunkSize = 400;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const columns = [...new Set(chunk.flatMap((row) => Object.keys(row)))];
    if (columns.length === 0) continue;
    const parameters: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = columns.map((column) => {
        const value = row[column];
        if (value === undefined) return "default";
        parameters.push(
          column === "roles" && Array.isArray(value)
            ? database.array([...(value as readonly string[])] as never[])
            : value !== null && typeof value === "object"
              ? database.json(value as never)
              : value,
        );
        return `$${parameters.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await database.unsafe(
      `insert into public.${identifier(table)} (${columns.map(identifier).join(", ")}) values ${tuples.join(", ")}${ignoreConflict ? " on conflict do nothing" : ""}`,
      parameters as never[],
    );
  }
}
async function readLookupIndex(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
): Promise<readonly MappedRow[]> {
  let values: readonly (readonly unknown[])[] = [];
  try {
    values =
      (
        await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: "'PUBLIC_LOOKUP_INDEX'!A2:IV",
        })
      ).data.values ?? [];
  } catch (error) {
    if (isMissingSheetError(error)) {
      console.log("[skip] Tab extension chưa tồn tại: PUBLIC_LOOKUP_INDEX");
      return [];
    }
    throw error;
  }
  const result: MappedRow[] = [];
  for (const row of values) {
    for (const cell of row) {
      if (!cell) continue;
      const item = JSON.parse(String(cell)) as {
        kind?: unknown;
        citizenIdHmac?: unknown;
        existingRecordId?: unknown;
        submissionId?: unknown;
      };
      if (
        (item.kind !== "EXISTING" && item.kind !== "PENDING") ||
        typeof item.citizenIdHmac !== "string"
      )
        continue;
      result.push({
        kind: item.kind,
        citizen_id_hmac: item.citizenIdHmac,
        existing_record_id:
          typeof item.existingRecordId === "string" ? item.existingRecordId : undefined,
        submission_id: typeof item.submissionId === "string" ? item.submissionId : undefined,
      });
    }
  }
  return result;
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const environment = loadLegacyGoogleSheetsEnvironment();
  const { sheets } = createGoogleWorkspaceClient({
    clientId: environment.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: environment.GOOGLE_DRIVE_CLIENT_SECRET,
    refreshToken: environment.GOOGLE_DRIVE_REFRESH_TOKEN,
  });

  const loaded = new Map<string, readonly { row: RawRow; sheetRow: number }[]>();
  for (const spec of IMPORT_SPECS) {
    if (!loaded.has(spec.sheet))
      loaded.set(
        spec.sheet,
        await readSheet(sheets, environment.GOOGLE_SHEETS_SPREADSHEET_ID, spec.sheet),
      );
  }
  const lookupRows = await readLookupIndex(sheets, environment.GOOGLE_SHEETS_SPREADSHEET_ID);
  const summary = IMPORT_SPECS.map(
    (spec) => `${spec.sheet}:${loaded.get(spec.sheet)?.length ?? 0}`,
  ).join("|");
  const sourceHash = createHash("sha256")
    .update(environment.GOOGLE_SHEETS_SPREADSHEET_ID)
    .digest("hex");
  const markerKey = `LEGACY_SHEETS_IMPORT:${sourceHash.slice(0, 24)}`;

  if (process.argv.includes("--dry-run")) {
    for (const spec of IMPORT_SPECS) {
      const rows = loaded.get(spec.sheet) ?? [];
      for (const { row, sheetRow } of rows) spec.map(row, sheetRow);
      console.log(`${spec.sheet} -> ${spec.table}: ${rows.length} dòng`);
    }
    console.log(`PUBLIC_LOOKUP_INDEX -> public_lookup_index: ${lookupRows.length} mục`);
    console.log("Dry run hợp lệ: đã đọc và kiểm tra chuyển kiểu toàn bộ dữ liệu nguồn.");
    return;
  }

  const database = getDatabase();
  await database.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtextextended(${markerKey}, 0))`;
    const previous =
      await transaction`select 1 from public.request_log where idempotency_key = ${markerKey}`;
    if (previous.length > 0) throw new Error("Workbook này đã được nhập thành công trước đó.");

    for (const spec of IMPORT_SPECS) {
      const rows = loaded.get(spec.sheet) ?? [];
      const mappedRows = rows.map(({ row, sheetRow }) => spec.map(row, sheetRow));
      await insertRows(transaction, spec.table, mappedRows);
      console.log(`${spec.sheet} -> ${spec.table}: ${rows.length} dòng`);
    }
    await transaction`
      insert into public.public_lookup_index (kind, citizen_id_hmac, existing_record_id)
      select distinct 'EXISTING', citizen_id_hmac, existing_record_id
      from public.existing_certificate_owners
      on conflict do nothing
    `;
    await insertRows(transaction, "public_lookup_index", lookupRows, true);

    await transaction`
      insert into public.request_log
        (idempotency_key, request_id, kind, mutation_hash, response_json, created_at, expires_at)
      values (
        ${markerKey}, ${randomUUID()}, 'LEGACY_SHEETS_IMPORT',
        ${createHash("sha256").update(summary).digest("hex")},
        ${transaction.json({ completed: true, lookupRows: lookupRows.length })}, now(), '9999-12-31T23:59:59Z'
      )
    `;
  });
  console.log("Đã nhập Google Sheets vào Supabase trong một transaction.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration Sheets -> Supabase thất bại.");
  process.exitCode = 1;
});
