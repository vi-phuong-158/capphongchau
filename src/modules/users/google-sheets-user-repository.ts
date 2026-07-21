import { createHash, randomUUID } from "node:crypto";

import type { sheets_v4 } from "googleapis";

import { UserRole } from "@/modules/common/domain";
import { loadGoogleStorageEnvironment, type GoogleStorageEnvironment } from "@/modules/common/env";
import { createGoogleWorkspaceClient } from "@/modules/google/workspace-client";

export interface ActiveUser {
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly UserRole[];
}

export interface ManagedUser extends ActiveUser {
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserMutation {
  readonly mode: "CREATE" | "UPDATE";
  readonly email: string;
  readonly roles: readonly UserRole[];
  readonly active: boolean;
  readonly displayName: string;
  readonly actorEmail: string;
  readonly requestId: string;
  readonly idempotencyKey: string;
}

interface StoredUser extends ManagedUser {
  readonly rowIndex: number;
}

interface StoredRequest {
  readonly idempotencyKey: string;
  readonly mutationHash: string;
}

const USER_HEADERS = 6;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseRoles(value: string | undefined): UserRole[] {
  const knownRoles = new Set(Object.values(UserRole));
  return (value ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is UserRole => knownRoles.has(role as UserRole));
}

function readCell(row: readonly unknown[], column: number): string {
  const value = row[column];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

function isTrue(value: string): boolean {
  return value.trim().toUpperCase() === "TRUE";
}

function asCell(value: string): sheets_v4.Schema$CellData {
  return { userEnteredValue: { stringValue: value } };
}

function rowData(values: readonly string[]): sheets_v4.Schema$RowData {
  return { values: values.map(asCell) };
}

function entityHash(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function mutationHash(mutation: UserMutation): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        mode: mutation.mode,
        email: normalizeEmail(mutation.email),
        roles: [...mutation.roles],
        active: mutation.active,
        displayName: mutation.displayName.trim(),
      }),
    )
    .digest("hex");
}

function actionForMutation(previous: StoredUser | undefined, mutation: UserMutation): string {
  if (!previous) return "USER_CREATED";
  if (previous.active && !mutation.active) return "USER_LOCKED";
  if (!previous.active && mutation.active) return "USER_UNLOCKED";
  if (previous.roles.join(",") !== mutation.roles.join(",")) return "USER_ROLES_CHANGED";
  return "USER_UPDATED";
}

export class GoogleSheetsUserRepository {
  constructor(
    private readonly environment: GoogleStorageEnvironment = loadGoogleStorageEnvironment(),
  ) {}

  async list(): Promise<ManagedUser[]> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.environment.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: "USERS!A2:F",
    });
    return this.parseUsers(response.data.values ?? []).map((user) => this.withoutRowIndex(user));
  }

  async findActiveByEmail(email: string): Promise<ActiveUser | null> {
    const normalizedEmail = normalizeEmail(email);
    const users = await this.listStoredUsers();
    const user = users.find((candidate) => candidate.email === normalizedEmail && candidate.active);
    return user ? { email: user.email, displayName: user.displayName, roles: user.roles } : null;
  }

  async mutate(mutation: UserMutation): Promise<ManagedUser> {
    const { sheets } = this.workspace();
    const normalizedMutation = { ...mutation, email: normalizeEmail(mutation.email) };
    const [usersResult, requestsResult, spreadsheetResult] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: this.environment.GOOGLE_SHEETS_SPREADSHEET_ID,
        range: "USERS!A2:F",
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: this.environment.GOOGLE_SHEETS_SPREADSHEET_ID,
        range: "REQUEST_LOG!A2:F",
      }),
      sheets.spreadsheets.get({
        spreadsheetId: this.environment.GOOGLE_SHEETS_SPREADSHEET_ID,
        fields: "sheets.properties(sheetId,title)",
      }),
    ]);
    const users = this.parseUsers(usersResult.data.values ?? []);
    const previous = users.find((user) => user.email === normalizedMutation.email);
    const action = actionForMutation(previous, normalizedMutation);
    const hash = entityHash(normalizedMutation.email);
    const fingerprint = mutationHash(normalizedMutation);
    const previousRequest = this.parseRequests(requestsResult.data.values ?? []).find(
      (request) => request.idempotencyKey === normalizedMutation.idempotencyKey,
    );

    if (previousRequest) {
      if (previousRequest.mutationHash !== fingerprint) {
        throw new IdempotencyConflictError();
      }
      const current = users.find((user) => user.email === normalizedMutation.email);
      if (!current) {
        throw new IdempotencyConflictError();
      }
      return this.withoutRowIndex(current);
    }

    if (normalizedMutation.mode === "CREATE" && previous) {
      throw new UserAlreadyExistsError();
    }

    const now = new Date().toISOString();
    const nextUser: StoredUser = {
      email: normalizedMutation.email,
      roles: [...normalizedMutation.roles],
      active: normalizedMutation.active,
      displayName: normalizedMutation.displayName.trim(),
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      rowIndex: previous?.rowIndex ?? users.length + 1,
    };
    const sheetIds = this.sheetIds(spreadsheetResult.data.sheets ?? []);
    const auditMetadata = {
      targetHash: hash,
      activeChanged: previous ? previous.active !== nextUser.active : true,
      rolesChanged: previous ? previous.roles.join(",") !== nextUser.roles.join(",") : true,
    };
    const requests: sheets_v4.Schema$Request[] = [
      previous
        ? {
            updateCells: {
              range: {
                sheetId: sheetIds.USERS,
                startRowIndex: previous.rowIndex,
                endRowIndex: previous.rowIndex + 1,
                startColumnIndex: 0,
                endColumnIndex: USER_HEADERS,
              },
              rows: [rowData(this.userRow(nextUser))],
              fields: "userEnteredValue",
            },
          }
        : {
            appendCells: {
              sheetId: sheetIds.USERS,
              rows: [rowData(this.userRow(nextUser))],
              fields: "userEnteredValue",
            },
          },
      {
        appendCells: {
          sheetId: sheetIds.AUDIT_LOGS,
          rows: [
            rowData([
              randomUUID(),
              now,
              normalizedMutation.actorEmail,
              action,
              "USER",
              hash,
              normalizedMutation.requestId,
              JSON.stringify(auditMetadata),
            ]),
          ],
          fields: "userEnteredValue",
        },
      },
      {
        appendCells: {
          sheetId: sheetIds.REQUEST_LOG,
          rows: [
            rowData([
              normalizedMutation.idempotencyKey,
              normalizedMutation.requestId,
              JSON.stringify({ mutationHash: fingerprint }),
              now,
              new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            ]),
          ],
          fields: "userEnteredValue",
        },
      },
    ];

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.environment.GOOGLE_SHEETS_SPREADSHEET_ID,
      requestBody: { requests },
    });
    return this.withoutRowIndex(nextUser);
  }

  async appendDeniedSignInAudit(email: string): Promise<void> {
    const { sheets } = this.workspace();
    const now = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId: this.environment.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: "AUDIT_LOGS!A:H",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            randomUUID(),
            now,
            "SYSTEM",
            "AUTH_SIGN_IN_DENIED",
            "AUTH",
            entityHash(email),
            randomUUID(),
            JSON.stringify({ reason: "NOT_ALLOWLISTED_OR_INACTIVE" }),
          ],
        ],
      },
    });
  }

  private workspace() {
    return createGoogleWorkspaceClient({
      clientId: this.environment.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: this.environment.GOOGLE_DRIVE_CLIENT_SECRET,
      refreshToken: this.environment.GOOGLE_DRIVE_REFRESH_TOKEN,
    });
  }

  private async listStoredUsers(): Promise<StoredUser[]> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.environment.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: "USERS!A2:F",
    });
    return this.parseUsers(response.data.values ?? []);
  }

  private parseUsers(rows: readonly (readonly unknown[])[]): StoredUser[] {
    return rows
      .map((row, index) => ({
        email: normalizeEmail(readCell(row, 0)),
        roles: parseRoles(readCell(row, 1)),
        active: isTrue(readCell(row, 2)),
        displayName: readCell(row, 3),
        createdAt: readCell(row, 4),
        updatedAt: readCell(row, 5),
        rowIndex: index + 1,
      }))
      .filter((user) => user.email && user.roles.length > 0);
  }

  private parseRequests(rows: readonly (readonly unknown[])[]): StoredRequest[] {
    return rows.flatMap((row) => {
      try {
        const response = JSON.parse(readCell(row, 2)) as { mutationHash?: string };
        const idempotencyKey = readCell(row, 0);
        return idempotencyKey && response.mutationHash
          ? [{ idempotencyKey, mutationHash: response.mutationHash }]
          : [];
      } catch {
        return [];
      }
    });
  }

  private sheetIds(
    sheets: readonly sheets_v4.Schema$Sheet[],
  ): Record<"USERS" | "AUDIT_LOGS" | "REQUEST_LOG", number> {
    const ids = new Map(
      sheets.map((sheet) => [sheet.properties?.title, sheet.properties?.sheetId]),
    );
    const users = ids.get("USERS");
    const auditLogs = ids.get("AUDIT_LOGS");
    const requestLog = ids.get("REQUEST_LOG");
    if (
      typeof users !== "number" ||
      typeof auditLogs !== "number" ||
      typeof requestLog !== "number"
    ) {
      throw new Error("Google Sheets thiếu tab bắt buộc cho quản trị người dùng.");
    }
    return { USERS: users, AUDIT_LOGS: auditLogs, REQUEST_LOG: requestLog };
  }

  private userRow(user: StoredUser): string[] {
    return [
      user.email,
      user.roles.join(","),
      user.active ? "TRUE" : "FALSE",
      user.displayName,
      user.createdAt,
      user.updatedAt,
    ];
  }

  private withoutRowIndex(user: StoredUser): ManagedUser {
    return {
      email: user.email,
      roles: user.roles,
      active: user.active,
      displayName: user.displayName,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key đã được dùng cho một thao tác khác.");
    this.name = "IdempotencyConflictError";
  }
}

export class UserAlreadyExistsError extends Error {
  constructor() {
    super("Email này đã có trong danh sách người dùng.");
    this.name = "UserAlreadyExistsError";
  }
}

export function getGoogleSheetsUserRepository(): GoogleSheetsUserRepository {
  return new GoogleSheetsUserRepository();
}
