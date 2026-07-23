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
    fields: "sheets.properties(sheetId,title,gridProperties.columnCount)",
  });
  const existingTitles = new Set(
    (existing.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => typeof title === "string"),
  );

  const missing = PUBLIC_SHEET_DEFINITIONS.filter(({ title }) => !existingTitles.has(title));

  if (missing.length > 0) {
    console.log(`Thêm ${missing.length} tab: ${missing.map(({ title }) => title).join(", ")}`);

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: missing.map(({ title, headers }) => ({
          addSheet: {
            properties: {
              title,
              gridProperties: { columnCount: Math.max(26, headers.length) },
            },
          },
        })),
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
  }

  // Tab đã có thì chỉ **nối thêm** cột còn thiếu vào cuối hàng header. Không đổi tên, không chèn
  // giữa, không xóa: dữ liệu đã ghi được định vị theo chỉ số cột nên dịch cột là hỏng toàn bộ.
  const appended = await appendMissingHeaders(sheets, spreadsheetId, existingTitles);

  if (missing.length === 0 && appended.length === 0) {
    console.log("Không có tab hay cột nào cần thêm. Migration đã ở trạng thái mong muốn.");
    return;
  }

  console.log("Xong. Đã tạo tab và đồng bộ header.");
}

/** Trả về mô tả các cột vừa được nối thêm, rỗng nghĩa là không có gì phải làm. */
async function appendMissingHeaders(
  sheets: ReturnType<typeof createGoogleWorkspaceClient>["sheets"],
  spreadsheetId: string,
  existingTitles: ReadonlySet<string>,
): Promise<string[]> {
  const present = PUBLIC_SHEET_DEFINITIONS.filter(({ title }) => existingTitles.has(title));
  if (present.length === 0) {
    return [];
  }

  const current = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: present.map(({ title }) => `${title}!1:1`),
  });

  const updates: { range: string; values: string[][] }[] = [];
  const report: string[] = [];

  present.forEach((definition, index) => {
    const existingHeaders = (current.data.valueRanges?.[index]?.values?.[0] ?? []).map(String);
    if (existingHeaders.length >= definition.headers.length) {
      return;
    }

    const extra = definition.headers.slice(existingHeaders.length);
    const startColumn = columnLetter(existingHeaders.length + 1);
    updates.push({
      range: `${definition.title}!${startColumn}1`,
      values: [[...extra]],
    });
    report.push(`${definition.title}: +${extra.join(", ")}`);
  });

  if (updates.length === 0) {
    return [];
  }

  console.log(`Nối cột vào tab đã có:\n  ${report.join("\n  ")}`);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "RAW", data: updates },
  });
  return report;
}

function columnLetter(oneBasedIndex: number): string {
  let remaining = oneBasedIndex;
  let letters = "";
  while (remaining > 0) {
    const rest = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return letters;
}

main().catch((error: unknown) => {
  // Chỉ in thông điệp, không in cấu hình hay token.
  console.error(error instanceof Error ? error.message : "Migration thất bại.");
  process.exitCode = 1;
});
