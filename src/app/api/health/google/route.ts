import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { REQUIRED_SHEET_TITLES } from "@/modules/bootstrap";
import { createApiErrorPayload } from "@/modules/common/api-error";
import { loadGoogleStorageEnvironment } from "@/modules/common/env";
import { createGoogleWorkspaceClient } from "@/modules/google/workspace-client";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const requestId = `req_${randomUUID()}`;

  try {
    const environment = loadGoogleStorageEnvironment();
    const { drive, sheets } = createGoogleWorkspaceClient({
      clientId: environment.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: environment.GOOGLE_DRIVE_CLIENT_SECRET,
      refreshToken: environment.GOOGLE_DRIVE_REFRESH_TOKEN,
    });
    const [rootFolder, spreadsheet, about] = await Promise.all([
      drive.files.get({
        fileId: environment.GOOGLE_MY_DRIVE_ROOT_FOLDER_ID,
        fields: "id,mimeType,trashed",
      }),
      sheets.spreadsheets.get({
        spreadsheetId: environment.GOOGLE_SHEETS_SPREADSHEET_ID,
        fields: "sheets.properties.title",
      }),
      drive.about.get({
        fields: "storageQuota",
      }),
    ]);
    const titles = new Set(
      spreadsheet.data.sheets?.flatMap((sheet) =>
        sheet.properties?.title ? [sheet.properties.title] : [],
      ),
    );
    const schemaReady = REQUIRED_SHEET_TITLES.every((title) => titles.has(title));
    const driveReady =
      rootFolder.data.mimeType === "application/vnd.google-apps.folder" && !rootFolder.data.trashed;

    let quotaReady = false;
    if (about.data.storageQuota?.limit && about.data.storageQuota?.usage) {
      const freeBytes =
        Number(about.data.storageQuota.limit) - Number(about.data.storageQuota.usage);
      const freeGb = freeBytes / 1024 ** 3;
      quotaReady = freeGb >= environment.MIN_DRIVE_FREE_GB;
    } else {
      // If limit is not present (e.g. unlimited), assume ready.
      quotaReady = true;
    }

    if (!driveReady || !schemaReady || !quotaReady) {
      return NextResponse.json(
        createApiErrorPayload({
          code: "INTERNAL_ERROR",
          message: "Kho dữ liệu chưa đúng cấu hình hoặc không đủ dung lượng.",
          requestId,
          details: {
            component: !driveReady ? "drive_root" : !schemaReady ? "sheets_schema" : "drive_quota",
          },
        }),
        { status: 503 },
      );
    }

    return NextResponse.json({
      status: "ok",
      requestId,
      checks: { oauth: "ok", drive: "ok", sheets: "ok", schema: "ok" },
    });
  } catch {
    return NextResponse.json(
      createApiErrorPayload({
        code: "INTERNAL_ERROR",
        message: "Không thể kiểm tra kết nối Google.",
        requestId,
        details: { component: "google_connection" },
      }),
      { status: 503 },
    );
  }
}
