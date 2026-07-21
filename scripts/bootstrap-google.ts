import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";

import { loadEnvConfig } from "@next/env";
import { google } from "googleapis";
import { z } from "zod";

import {
  createReferenceDataRows,
  DRIVE_ROOT_NAME,
  GOOGLE_DRIVE_FILE_SCOPE,
  NEIGHBORHOOD_CODES,
  SHEET_DEFINITIONS,
  SPREADSHEET_TITLE,
} from "../src/modules/bootstrap";
import { createGoogleWorkspaceClient } from "../src/modules/google/workspace-client";

const STATE_FILE = ".bootstrap-state.json";
const SECRETS_FILE = ".bootstrap-secrets.json";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const bootstrapEnvironmentSchema = z.object({
  GOOGLE_DRIVE_CLIENT_ID: z.string().min(1),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_DRIVE_REFRESH_TOKEN: z.string().min(1).optional(),
  SYSTEM_ADMIN_EMAIL: z.email(),
});
const bootstrapStateSchema = z.object({
  rootFolderId: z.string().min(1),
  spreadsheetId: z.string().min(1),
});
const bootstrapSecretsSchema = z.object({
  googleDriveRefreshToken: z.string().min(1),
});

type BootstrapEnvironment = z.output<typeof bootstrapEnvironmentSchema>;

loadEnvConfig(process.cwd());

function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

function escapeDriveQueryValue(value: string): string {
  return value.replaceAll("'", "\\'");
}

async function readJsonFile<T>(fileName: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    return schema.parse(JSON.parse(await readFile(fileName, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw new Error(
      `Tệp cục bộ ${fileName} không hợp lệ. Hãy xóa tệp này trước khi bootstrap lại.`,
    );
  }
}

async function writeJsonFile(fileName: string, value: unknown): Promise<void> {
  await writeFile(fileName, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function waitForAuthorizationCode(clientId: string, clientSecret: string): Promise<string> {
  const state = randomUUID();
  const callbackPath = "/oauth2callback";
  const authorization = await new Promise<{
    readonly code: string;
    readonly redirectUri: string;
  }>((resolve, reject) => {
    const server = createServer((request, response) => {
      handleOAuthCallback(request, response, callbackPath, state, (code) => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Không xác định được callback OAuth cục bộ."));
          return;
        }

        server.close();
        resolve({ code, redirectUri: `http://127.0.0.1:${address.port}${callbackPath}` });
      });
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Không thể mở callback OAuth cục bộ."));
        return;
      }

      const redirectUri = `http://127.0.0.1:${address.port}${callbackPath}`;
      const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      const url = oauth.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [GOOGLE_DRIVE_FILE_SCOPE],
        state,
      });
      writeLine("Mở URL sau bằng trình duyệt và đăng nhập đúng tài khoản quản trị:");
      writeLine(url);
    });

    setTimeout(
      () => {
        server.close();
        reject(new Error("Hết thời gian chờ xác nhận OAuth sau 10 phút."));
      },
      10 * 60 * 1000,
    ).unref();
  });

  const oauth = new google.auth.OAuth2(clientId, clientSecret, authorization.redirectUri);
  const tokenResponse = await oauth.getToken(authorization.code);
  const refreshToken = tokenResponse.tokens.refresh_token;
  if (!refreshToken) {
    throw new Error(
      "Google không trả refresh token. Hãy thu hồi quyền ứng dụng rồi chạy lại bootstrap.",
    );
  }

  return refreshToken;
}

function handleOAuthCallback(
  request: IncomingMessage,
  response: ServerResponse,
  callbackPath: string,
  expectedState: string,
  onCode: (code: string) => void,
): void {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (
    requestUrl.pathname !== callbackPath ||
    requestUrl.searchParams.get("state") !== expectedState
  ) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Yêu cầu OAuth không hợp lệ. Có thể đóng cửa sổ này và thử lại.");
    return;
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Google không trả authorization code. Có thể đóng cửa sổ này và thử lại.");
    return;
  }

  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("Đã xác nhận. Có thể đóng cửa sổ này và quay lại terminal.");
  onCode(code);
}

async function findOrCreateFolder(
  drive: ReturnType<typeof createGoogleWorkspaceClient>["drive"],
  name: string,
  parentId?: string,
): Promise<string> {
  const queryParts = [
    `name = '${escapeDriveQueryValue(name)}'`,
    `mimeType = '${FOLDER_MIME_TYPE}'`,
    "trashed = false",
  ];
  if (parentId) {
    queryParts.push(`'${parentId}' in parents`);
  } else {
    queryParts.push("'root' in parents");
  }

  const existing = await drive.files.list({
    q: queryParts.join(" and "),
    fields: "files(id)",
    pageSize: 1,
  });
  const existingId = existing.data.files?.[0]?.id;
  if (existingId) {
    return existingId;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME_TYPE,
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  if (!created.data.id) {
    throw new Error(`Google Drive không trả folder ID cho ${name}.`);
  }

  return created.data.id;
}

async function createSpreadsheet(
  sheets: ReturnType<typeof createGoogleWorkspaceClient>["sheets"],
): Promise<string> {
  const result = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: SPREADSHEET_TITLE },
      sheets: SHEET_DEFINITIONS.map(({ title }) => ({ properties: { title } })),
    },
  });
  if (!result.data.spreadsheetId) {
    throw new Error("Google Sheets không trả spreadsheet ID.");
  }

  return result.data.spreadsheetId;
}

async function populateSpreadsheet(
  sheets: ReturnType<typeof createGoogleWorkspaceClient>["sheets"],
  spreadsheetId: string,
  adminEmail: string,
): Promise<void> {
  const now = new Date().toISOString();
  const data: Array<{ range: string; values: string[][] }> = SHEET_DEFINITIONS.map(
    ({ title, headers }) => ({
      range: `${title}!A1`,
      values: [[...headers]],
    }),
  );
  data.push(
    { range: "REFERENCE_DATA!A2", values: createReferenceDataRows() },
    {
      range: "USERS!A2",
      values: [[adminEmail, "SYSTEM_ADMIN", "TRUE", "Quản trị viên hệ thống", now, now]],
    },
  );

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "RAW", data },
  });
}

async function moveSpreadsheetToConfigFolder(
  drive: ReturnType<typeof createGoogleWorkspaceClient>["drive"],
  spreadsheetId: string,
  configFolderId: string,
): Promise<void> {
  const spreadsheet = await drive.files.get({ fileId: spreadsheetId, fields: "parents" });
  await drive.files.update({
    fileId: spreadsheetId,
    addParents: configFolderId,
    removeParents: spreadsheet.data.parents?.join(","),
    fields: "id",
  });
}

async function bootstrap(): Promise<void> {
  const environment = bootstrapEnvironmentSchema.parse(process.env) satisfies BootstrapEnvironment;
  const state = await readJsonFile(STATE_FILE, bootstrapStateSchema);
  const storedSecrets = await readJsonFile(SECRETS_FILE, bootstrapSecretsSchema);
  const refreshToken =
    environment.GOOGLE_DRIVE_REFRESH_TOKEN ??
    storedSecrets?.googleDriveRefreshToken ??
    (await waitForAuthorizationCode(
      environment.GOOGLE_DRIVE_CLIENT_ID,
      environment.GOOGLE_DRIVE_CLIENT_SECRET,
    ));

  if (!environment.GOOGLE_DRIVE_REFRESH_TOKEN && !storedSecrets) {
    await writeJsonFile(SECRETS_FILE, { googleDriveRefreshToken: refreshToken });
  }

  const { drive, sheets } = createGoogleWorkspaceClient({
    clientId: environment.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: environment.GOOGLE_DRIVE_CLIENT_SECRET,
    refreshToken,
  });
  const rootFolderId = state?.rootFolderId ?? (await findOrCreateFolder(drive, DRIVE_ROOT_NAME));
  const configFolderId = await findOrCreateFolder(drive, "00_CONFIG", rootFolderId);
  await findOrCreateFolder(drive, "01_INBOX", rootFolderId);
  const casesFolderId = await findOrCreateFolder(drive, "02_CASES", rootFolderId);
  await Promise.all(
    NEIGHBORHOOD_CODES.map((code) => findOrCreateFolder(drive, code, casesFolderId)),
  );
  await findOrCreateFolder(drive, "03_EXPORTS", rootFolderId);
  await findOrCreateFolder(drive, "99_BACKUP", rootFolderId);

  const spreadsheetId = state?.spreadsheetId ?? (await createSpreadsheet(sheets));
  if (!state?.spreadsheetId) {
    await moveSpreadsheetToConfigFolder(drive, spreadsheetId, configFolderId);
    await populateSpreadsheet(sheets, spreadsheetId, environment.SYSTEM_ADMIN_EMAIL);
  }

  await writeJsonFile(STATE_FILE, { rootFolderId, spreadsheetId });
  writeLine("Bootstrap hoàn tất. ID được lưu cục bộ trong .bootstrap-state.json.");
  writeLine(
    "Refresh token được lưu cục bộ trong .bootstrap-secrets.json; hãy chuyển vào biến môi trường rồi xóa tệp này.",
  );
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Lỗi bootstrap không xác định.";
  writeLine(`Bootstrap thất bại: ${message}`);
  process.exitCode = 1;
});
