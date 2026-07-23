import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createApiErrorPayload } from "@/modules/common/api-error";
import { loadGoogleStorageEnvironment } from "@/modules/common/env";
import { createGoogleWorkspaceClient } from "@/modules/google/workspace-client";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const requestId = `req_${randomUUID()}`;

  try {
    const environment = loadGoogleStorageEnvironment();
    const { drive } = createGoogleWorkspaceClient({
      clientId: environment.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: environment.GOOGLE_DRIVE_CLIENT_SECRET,
      refreshToken: environment.GOOGLE_DRIVE_REFRESH_TOKEN,
    });
    const [rootFolder, about] = await Promise.all([
      drive.files.get({
        fileId: environment.GOOGLE_MY_DRIVE_ROOT_FOLDER_ID,
        fields: "id,mimeType,trashed",
      }),
      drive.about.get({ fields: "storageQuota" }),
    ]);
    const driveReady =
      rootFolder.data.mimeType === "application/vnd.google-apps.folder" && !rootFolder.data.trashed;

    let quotaReady = false;
    if (about.data.storageQuota?.limit && about.data.storageQuota?.usage) {
      const freeBytes =
        Number(about.data.storageQuota.limit) - Number(about.data.storageQuota.usage);
      quotaReady = freeBytes / 1024 ** 3 >= environment.MIN_DRIVE_FREE_GB;
    } else {
      quotaReady = true;
    }

    if (!driveReady || !quotaReady) {
      return NextResponse.json(
        createApiErrorPayload({
          code: "INTERNAL_ERROR",
          message: "Kho tệp Google Drive chưa đúng cấu hình hoặc không đủ dung lượng.",
          requestId,
          details: { component: !driveReady ? "drive_root" : "drive_quota" },
        }),
        { status: 503 },
      );
    }

    return NextResponse.json({
      status: "ok",
      requestId,
      checks: { oauth: "ok", drive: "ok", quota: "ok" },
    });
  } catch {
    return NextResponse.json(
      createApiErrorPayload({
        code: "INTERNAL_ERROR",
        message: "Không thể kiểm tra kết nối Google Drive.",
        requestId,
        details: { component: "google_drive_connection" },
      }),
      { status: 503 },
    );
  }
}
