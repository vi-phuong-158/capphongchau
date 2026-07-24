import { google, type drive_v3, type sheets_v4 } from "googleapis";

export interface GoogleWorkspaceCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
}

export interface GoogleWorkspaceClient {
  readonly drive: drive_v3.Drive;
  readonly sheets: sheets_v4.Sheets;
}

const DEFAULT_TIMEOUT_MS = 15_000;

declare global {
  var __googleOAuthClients: Map<string, InstanceType<typeof google.auth.OAuth2>> | undefined;
}

function getOAuth2Client(credentials: GoogleWorkspaceCredentials) {
  if (!globalThis.__googleOAuthClients) {
    globalThis.__googleOAuthClients = new Map();
  }
  const key = `${credentials.clientId}:${credentials.refreshToken}`;
  let client = globalThis.__googleOAuthClients.get(key);
  if (!client) {
    client = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);
    client.setCredentials({ refresh_token: credentials.refreshToken });
    globalThis.__googleOAuthClients.set(key, client);
  }
  return client;
}

/**
 * Chỉ tạo client phía server/CLI. Component và service nghiệp vụ phải đi qua
 * DataRepository hoặc StorageRepository, không dùng client này trực tiếp.
 */
export function createGoogleWorkspaceClient(
  credentials: GoogleWorkspaceCredentials,
): GoogleWorkspaceClient {
  const auth = getOAuth2Client(credentials);

  return {
    drive: google.drive({ version: "v3", auth, timeout: DEFAULT_TIMEOUT_MS }),
    sheets: google.sheets({ version: "v4", auth, timeout: DEFAULT_TIMEOUT_MS }),
  };
}

/**
 * Access token dùng cho các endpoint Drive mà client `googleapis` không bọc sẵn — cụ thể là
 * tạo phiên resumable upload. Token chỉ tồn tại trong bộ nhớ của request, không ghi log.
 */
export async function getGoogleAccessToken(
  credentials: GoogleWorkspaceCredentials,
): Promise<string> {
  const auth = getOAuth2Client(credentials);
  const { token } = await auth.getAccessToken();
  if (!token) {
    throw new Error("Không lấy được access token của Google.");
  }
  return token;
}
