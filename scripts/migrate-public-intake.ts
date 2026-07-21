/**
 * Migration idempotent: thêm nhóm tab `PUBLIC_*` cho cổng kê khai công khai.
 *
 * Chỉ **thêm tab mới**, không sửa cột của tab đang có dữ liệu (`CASES`, `CERTIFICATES`,
 * `OWNERS`, ...). Phần mở rộng cột cho luồng chấp nhận hồ sơ là migration riêng, rủi ro cao hơn
 * hẳn và phải backup trước (PLAN_NL §5.2).
 *
 * Chạy lại nhiều lần an toàn: tab đã có thì bỏ qua, chỉ ghi header cho tab vừa tạo.
 */
import { loadEnvConfig } from "@next/env";

import { PUBLIC_SHEET_DEFINITIONS } from "@/modules/bootstrap";
import { loadGoogleStorageEnvironment } from "@/modules/common/env";
import { createGoogleWorkspaceClient } from "@/modules/google/workspace-client";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const environment = loadGoogleStorageEnvironment();
  const { sheets } = createGoogleWorkspaceClient({
    clientId: environment.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: environment.GOOGLE_DRIVE_CLIENT_SECRET,
    refreshToken: environment.GOOGLE_DRIVE_REFRESH_TOKEN,
  });
  const spreadsheetId = environment.GOOGLE_SHEETS_SPREADSHEET_ID;

  const existing = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(title)",
  });
  const existingTitles = new Set(
    (existing.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => typeof title === "string"),
  );

  const missing = PUBLIC_SHEET_DEFINITIONS.filter(({ title }) => !existingTitles.has(title));

  if (missing.length === 0) {
    console.log("Không có tab nào cần thêm. Migration đã ở trạng thái mong muốn.");
    return;
  }

  console.log(`Thêm ${missing.length} tab: ${missing.map(({ title }) => title).join(", ")}`);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: missing.map(({ title }) => ({ addSheet: { properties: { title } } })),
    },
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: missing.map(({ title, headers }) => ({
        range: `${title}!A1`,
        values: [[...headers]],
      })),
    },
  });

  console.log("Xong. Đã tạo tab và ghi header.");
}

main().catch((error: unknown) => {
  // Chỉ in thông điệp, không in cấu hình hay token.
  console.error(error instanceof Error ? error.message : "Migration thất bại.");
  process.exitCode = 1;
});
