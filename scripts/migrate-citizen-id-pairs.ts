/**
 * Mở rộng schema theo kiểu append-only cho cặp ảnh CCCD và metadata QR.
 * Không xóa hoặc đổi vị trí cột đã tồn tại; có thể chạy lại an toàn.
 */
import { loadEnvConfig } from "@next/env";

import { loadLegacyGoogleSheetsEnvironment } from "@/modules/common/env";
import { createGoogleWorkspaceClient } from "@/modules/google/workspace-client";

const COLUMNS: Record<string, readonly string[]> = {
  FILES: ["owner_id"],
  IDENTITY_QR_SCANS: ["owner_id"],
  PUBLIC_OWNERS: [
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
  PUBLIC_FILES: ["owner_id"],
};

function columnName(index: number): string {
  let value = "";
  let current = index;
  do {
    value = String.fromCharCode(65 + (current % 26)) + value;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return value;
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const environment = loadLegacyGoogleSheetsEnvironment();
  const { sheets } = createGoogleWorkspaceClient({
    clientId: environment.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: environment.GOOGLE_DRIVE_CLIENT_SECRET,
    refreshToken: environment.GOOGLE_DRIVE_REFRESH_TOKEN,
  });

  for (const [sheetName, requiredHeaders] of Object.entries(COLUMNS)) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: environment.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `${sheetName}!1:1`,
    });
    const headers = (response.data.values?.[0] ?? []).map(String);
    const missing = requiredHeaders.filter((header) => !headers.includes(header));
    if (missing.length === 0) continue;

    const startColumn = columnName(headers.length);
    const endColumn = columnName(headers.length + missing.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: environment.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `${sheetName}!${startColumn}1:${endColumn}1`,
      valueInputOption: "RAW",
      requestBody: { values: [[...missing]] },
    });
    console.log(`${sheetName}: đã thêm ${missing.join(", ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration CCCD thất bại.");
  process.exitCode = 1;
});
