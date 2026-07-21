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
