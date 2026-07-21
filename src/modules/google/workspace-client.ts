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

/**
 * Chỉ tạo client phía server/CLI. Component và service nghiệp vụ phải đi qua
 * DataRepository hoặc StorageRepository, không dùng client này trực tiếp.
 */
export function createGoogleWorkspaceClient(
  credentials: GoogleWorkspaceCredentials,
): GoogleWorkspaceClient {
  const auth = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);
  auth.setCredentials({ refresh_token: credentials.refreshToken });

  return {
    drive: google.drive({ version: "v3", auth }),
    sheets: google.sheets({ version: "v4", auth }),
  };
}

/**
 * Access token dùng cho các endpoint Drive mà client `googleapis` không bọc sẵn — cụ thể là
 * tạo phiên resumable upload. Token chỉ tồn tại trong bộ nhớ của request, không ghi log.
 */
export async function getGoogleAccessToken(
  credentials: GoogleWorkspaceCredentials,
): Promise<string> {
  const auth = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);
  auth.setCredentials({ refresh_token: credentials.refreshToken });

  const { token } = await auth.getAccessToken();
  if (!token) {
    throw new Error("Không lấy được access token của Google.");
  }
  return token;
}
