import { randomUUID } from "node:crypto";

import type { sheets_v4 } from "googleapis";

import { loadGoogleStorageEnvironment, type GoogleStorageEnvironment } from "@/modules/common/env";
import { createGoogleWorkspaceClient } from "@/modules/google/workspace-client";

import type { IntakeDraft } from "./types";
import {
  type PublicFileSummary,
  type PublicStatus,
  type PublicTimelineEvent,
  type SupplementItem,
  type SupplementRequest,
} from "./workflow";

export { PUBLIC_STATUSES } from "./workflow";
export type { PublicStatus } from "./workflow";

export interface SubmissionRecord {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly status: PublicStatus;
  readonly phone: string;
  readonly version: number;
  readonly accessCodeHash: string;
  readonly failedAttempts: number;
  readonly lockedUntil: string;
  readonly consentVersion: string;
  readonly consentedAt: string;
  readonly retentionUntil: string;
  readonly driveFolderId: string;
  readonly officialCaseId: string;
  readonly acceptStep: string;
  readonly claimedBy: string;
  readonly claimedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly draft: IntakeDraft | null;
  readonly accessVersion: number;
  readonly fileSummaries: readonly PublicFileSummary[];
  /** Số dòng trong sheet (1-based, bỏ header) — chỉ dùng nội bộ để ghi đè. */
  readonly rowIndex: number;
}

/** Bản tóm tắt nhẹ cho hàng chờ cán bộ: không kèm `draft_json` (cột nặng nhất, tới 45KB/dòng). */
export interface SubmissionSummary {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly status: PublicStatus;
  readonly phone: string;
  readonly version: number;
  readonly claimedBy: string;
  readonly updatedAt: string;
  readonly rowIndex: number;
}

export interface StoredFile {
  readonly fileId: string;
  readonly submissionId: string;
  readonly ownerId: string;
  readonly documentType: "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
  readonly driveFileId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly fileName: string;
  readonly status: "UPLOADED" | "REPLACED" | "DELETED";
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface StoredCreationRequest {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly mutationHash: string;
}

export interface ExistingCertificateMatch {
  readonly existingRecordId: string;
  readonly issueNumber: string;
  readonly issueDate: string;
  readonly registryNumber: string;
}

export interface StoredSubmissionMutation {
  readonly kind: string;
  readonly mutationHash: string;
  readonly response: Record<string, string | number | null>;
}

export interface ExportJobRecord {
  readonly exportJobId: string;
  readonly exportType: string;
  readonly status: "COMPLETED" | "ARCHIVE_FAILED";
  readonly driveFileId: string;
  readonly fileName: string;
  readonly rowCount: number;
  readonly submissionCount: number;
  readonly warningCount: number;
  readonly checksumSha256: string;
  readonly actorEmail: string;
  /** JSON mô tả phạm vi xuất (số dòng chính thức/tồn đọng) — không chứa PII. */
  readonly scopeJson: string;
  readonly createdAt: string;
  readonly completedAt: string;
}

const SUBMISSION_COLUMNS = 21;

function cell(value: string): sheets_v4.Schema$CellData {
  return { userEnteredValue: { stringValue: value } };
}

function row(values: readonly string[]): sheets_v4.Schema$RowData {
  return { values: values.map(cell) };
}

function readCell(source: readonly unknown[], column: number): string {
  const value = source[column];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

function columnName(index: number): string {
  let current = index;
  let result = "";
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function requiredSheetId(ids: ReadonlyMap<string, number>, title: string): number {
  const id = ids.get(title);
  if (typeof id !== "number" || id < 0) {
    throw new Error(`Google Sheets thi?u tab ${title}.`);
  }
  return id;
}

function parseDraft(value: string): IntakeDraft | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as IntakeDraft;
  } catch {
    return null;
  }
}

function parseFileSummaries(value: string): PublicFileSummary[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as PublicFileSummary[]) : [];
  } catch {
    return [];
  }
}

function submissionFromRow(found: readonly unknown[], rowIndex: number): SubmissionRecord {
  return {
    submissionId: readCell(found, 0),
    receiptCode: readCell(found, 1),
    status: (readCell(found, 2) || "DRAFT") as PublicStatus,
    phone: readCell(found, 3),
    version: Number(readCell(found, 4)) || 1,
    accessCodeHash: readCell(found, 5),
    failedAttempts: Number(readCell(found, 6)) || 0,
    lockedUntil: readCell(found, 7),
    consentVersion: readCell(found, 8),
    consentedAt: readCell(found, 9),
    retentionUntil: readCell(found, 10),
    officialCaseId: readCell(found, 11),
    driveFolderId: readCell(found, 12),
    acceptStep: readCell(found, 13),
    claimedBy: readCell(found, 14),
    claimedAt: readCell(found, 15),
    createdAt: readCell(found, 16),
    updatedAt: readCell(found, 17),
    draft: parseDraft(readCell(found, 18)),
    accessVersion: Number(readCell(found, 19)) || 1,
    fileSummaries: parseFileSummaries(readCell(found, 20)),
    rowIndex,
  };
}

export class PublicIntakeRepository {
  constructor(
    private readonly environment: GoogleStorageEnvironment = loadGoogleStorageEnvironment(),
  ) {}

  async create(input: {
    submissionId: string;
    receiptCode: string;
    accessCodeHash: string;
    idempotencyKey: string;
    mutationHash: string;
    requestId: string;
    phone: string;
    driveFolderId: string;
    draft: IntakeDraft;
    consentVersion: string;
  }): Promise<void> {
    const { sheets } = this.workspace();
    const now = new Date().toISOString();
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: "sheets.properties(sheetId,title)",
    });
    const ids = new Map(
      (spreadsheet.data.sheets ?? []).map((sheet) => [
        sheet.properties?.title ?? "",
        sheet.properties?.sheetId ?? -1,
      ]),
    );
    const submissionsSheetId = ids.get("PUBLIC_SUBMISSIONS");
    const requestLogSheetId = ids.get("REQUEST_LOG");
    if (
      typeof submissionsSheetId !== "number" ||
      submissionsSheetId < 0 ||
      typeof requestLogSheetId !== "number" ||
      requestLogSheetId < 0
    ) {
      throw new Error("Google Sheets thiếu tab tạo bản kê khai hoặc idempotency.");
    }

    // Hai dòng phải cùng một batch: không được có nháp mà thiếu dấu vết idempotency sau khi
    // response bị đứt, vì retry khi đó sẽ tạo hồ sơ trùng.
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            appendCells: {
              sheetId: submissionsSheetId,
              rows: [
                row([
                  input.submissionId,
                  input.receiptCode,
                  "DRAFT",
                  input.phone,
                  "1",
                  input.accessCodeHash,
                  "0",
                  "",
                  input.consentVersion,
                  now,
                  "",
                  "",
                  input.driveFolderId,
                  "",
                  "",
                  "",
                  now,
                  now,
                  JSON.stringify(input.draft),
                  "1",
                  "[]",
                ]),
              ],
              fields: "userEnteredValue",
            },
          },
          {
            appendCells: {
              sheetId: requestLogSheetId,
              rows: [
                row([
                  input.idempotencyKey,
                  input.requestId,
                  JSON.stringify({
                    kind: "PUBLIC_CREATE",
                    submissionId: input.submissionId,
                    receiptCode: input.receiptCode,
                    mutationHash: input.mutationHash,
                  }),
                  now,
                  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                ]),
              ],
              fields: "userEnteredValue",
            },
          },
        ],
      },
    });
  }

  async findCreationByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<StoredCreationRequest | null> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "REQUEST_LOG!A2:E",
    });

    const rows = response.data.values ?? [];
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const candidate = rows[index];
      if (readCell(candidate, 0) !== idempotencyKey) continue;
      try {
        const cached = JSON.parse(readCell(candidate, 2)) as Partial<StoredCreationRequest> & {
          kind?: string;
        };
        if (
          cached.kind === "PUBLIC_CREATE" &&
          typeof cached.submissionId === "string" &&
          typeof cached.receiptCode === "string" &&
          typeof cached.mutationHash === "string"
        ) {
          return {
            submissionId: cached.submissionId,
            receiptCode: cached.receiptCode,
            mutationHash: cached.mutationHash,
          };
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  async findById(submissionId: string): Promise<SubmissionRecord | null> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_SUBMISSIONS!A2:U",
    });

    const rows = response.data.values ?? [];
    const index = rows.findIndex((candidate) => readCell(candidate, 0) === submissionId);
    if (index < 0) {
      return null;
    }

    return submissionFromRow(rows[index], index + 1);
  }

  async findByLocator(submissionId: string, rowIndex: number): Promise<SubmissionRecord | null> {
    if (!Number.isInteger(rowIndex) || rowIndex < 1) return this.findById(submissionId);
    const { sheets } = this.workspace();
    const sheetRow = rowIndex + 1;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `PUBLIC_SUBMISSIONS!A${sheetRow}:U${sheetRow}`,
    });
    const found = response.data.values?.[0] ?? [];
    if (readCell(found, 0) !== submissionId) return this.findById(submissionId);
    return submissionFromRow(found, rowIndex);
  }

  async findByReceiptCode(receiptCode: string): Promise<SubmissionRecord | null> {
    const normalized = receiptCode.trim().toUpperCase();
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_SUBMISSIONS!B2:B",
    });
    const index = (response.data.values ?? []).findIndex(
      (candidate) => readCell(candidate, 0).trim().toUpperCase() === normalized,
    );
    if (index < 0) return null;
    const sheetRow = index + 2;
    const rowResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `PUBLIC_SUBMISSIONS!A${sheetRow}:U${sheetRow}`,
    });
    const values = rowResponse.data.values?.[0] ?? [];
    return readCell(values, 1).trim().toUpperCase() === normalized
      ? submissionFromRow(values, index + 1)
      : null;
  }

  async updateAccessState(
    record: SubmissionRecord,
    input: {
      failedAttempts?: number;
      lockedUntil?: string;
      accessCodeHash?: string;
      incrementAccessVersion?: boolean;
    },
  ): Promise<SubmissionRecord> {
    // Kh?ng d?ng snapshot do caller truy?n ?? ghi c? h?ng: autosave/upload c? th? ?? thay ??i
    // draft, file summary ho?c tr?ng th?i nghi?p v? sau khi caller ??c b?n ghi.
    const current = await this.findByLocator(record.submissionId, record.rowIndex);
    if (!current) throw new Error("Kh?ng t?m th?y b?n k? khai khi c?p nh?t truy c?p.");
    const now = new Date().toISOString();
    const next: SubmissionRecord = {
      ...current,
      // version l? optimistic concurrency c?a d? li?u nghi?p v?. Th? sai m? ho?c reset m?
      // kh?ng ???c l?m ng??i n?p g?p VERSION_CONFLICT khi ?ang autosave.
      failedAttempts: input.failedAttempts ?? current.failedAttempts,
      lockedUntil: input.lockedUntil ?? current.lockedUntil,
      accessCodeHash: input.accessCodeHash ?? current.accessCodeHash,
      accessVersion: input.incrementAccessVersion
        ? current.accessVersion + 1
        : current.accessVersion,
      updatedAt: now,
    };
    const { sheets } = this.workspace();
    const sheetRow = current.rowIndex + 1;
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          {
            range: `PUBLIC_SUBMISSIONS!F${sheetRow}:H${sheetRow}`,
            values: [[next.accessCodeHash, String(next.failedAttempts), next.lockedUntil]],
          },
          { range: `PUBLIC_SUBMISSIONS!R${sheetRow}`, values: [[next.updatedAt]] },
          { range: `PUBLIC_SUBMISSIONS!T${sheetRow}`, values: [[String(next.accessVersion)]] },
        ],
      },
    });
    return next;
  }

  async findExistingCertificates(citizenIdHmac: string): Promise<ExistingCertificateMatch[]> {
    const bucket = Number.parseInt(citizenIdHmac.slice(0, 2), 16);
    if (!Number.isInteger(bucket) || bucket < 0 || bucket > 255) return [];
    const column = columnName(bucket + 1);
    const { sheets } = this.workspace();
    const indexResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `PUBLIC_LOOKUP_INDEX!${column}2:${column}`,
    });
    const recordIds = new Set<string>();
    for (const candidate of indexResponse.data.values ?? []) {
      try {
        const item = JSON.parse(readCell(candidate, 0)) as {
          citizenIdHmac?: string;
          existingRecordId?: string;
        };
        // Khớp chỉ theo HMAC của CCCD — ngày sinh/họ tên không đưa vào khóa (xem workflow.ts).
        if (item.citizenIdHmac === citizenIdHmac && item.existingRecordId) {
          recordIds.add(item.existingRecordId);
        }
      } catch {
        // Bỏ qua ô chỉ mục hỏng; health check/import report sẽ cảnh báo riêng.
      }
    }
    if (!recordIds.size) return [];

    const recordsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "EXISTING_CERTIFICATES!A2:I",
    });
    // EXISTING_CERTIFICATES l? append-only. Backfill c? th? append b?n hi?u ch?nh c?ng ID;
    // khi ?? d?ng cu?i c?ng l? tr?ng th?i hi?u l?c.
    const latest = new Map<string, readonly unknown[]>();
    for (const candidate of recordsResponse.data.values ?? []) {
      const recordId = readCell(candidate, 0);
      if (recordIds.has(recordId)) latest.set(recordId, candidate);
    }
    return [...latest.values()]
      .filter((candidate) => readCell(candidate, 5) === "VERIFIED")
      .map((candidate) => ({
        existingRecordId: readCell(candidate, 0),
        issueNumber: readCell(candidate, 1),
        issueDate: readCell(candidate, 3),
        registryNumber: readCell(candidate, 4),
      }));
  }

  async findStoredMutation(
    idempotencyKey: string,
    kind: string,
  ): Promise<StoredSubmissionMutation | null> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "REQUEST_LOG!A2:E",
    });
    for (let index = (response.data.values ?? []).length - 1; index >= 0; index -= 1) {
      const candidate = response.data.values?.[index] ?? [];
      if (readCell(candidate, 0) !== idempotencyKey) continue;
      try {
        const cached = JSON.parse(readCell(candidate, 2)) as Partial<StoredSubmissionMutation>;
        if (
          cached.kind === kind &&
          typeof cached.mutationHash === "string" &&
          cached.response &&
          typeof cached.response === "object" &&
          !Array.isArray(cached.response)
        ) {
          return {
            kind: cached.kind,
            mutationHash: cached.mutationHash,
            response: cached.response as Record<string, string | number | null>,
          };
        }
      } catch {
        return null;
      }
    }
    return null;
  }
  async commitStaffAction(input: {
    record: SubmissionRecord;
    expectedVersion: number;
    status: PublicStatus;
    claimedBy?: string;
    claimedAt?: string;
    supplementRequest?: SupplementRequest;
    actorEmail: string;
    auditAction: string;
    auditMetadata?: Record<string, string | number | boolean>;
    timelineEvent: PublicTimelineEvent;
    requestId: string;
    idempotencyKey: string;
    mutationHash: string;
  }): Promise<SubmissionRecord> {
    const current = await this.findByLocator(input.record.submissionId, input.record.rowIndex);
    if (!current || current.version !== input.expectedVersion)
      throw new SubmissionVersionConflictError();
    const now = new Date().toISOString();
    const next: SubmissionRecord = {
      ...current,
      status: input.status,
      version: current.version + 1,
      claimedBy: input.claimedBy ?? current.claimedBy,
      claimedAt: input.claimedAt ?? current.claimedAt,
      updatedAt: now,
    };
    const requiredTabs = [
      "PUBLIC_SUBMISSIONS",
      "PUBLIC_SUPPLEMENT_REQUESTS",
      "PUBLIC_SUPPLEMENT_ITEMS",
      "PUBLIC_STATUS_EVENTS",
      "AUDIT_LOGS",
      "REQUEST_LOG",
    ];
    const { sheets, ids } = await this.sheetsWithIds(requiredTabs);
    const rowIndex = current.rowIndex;
    const requests: sheets_v4.Schema$Request[] = [
      {
        updateCells: {
          range: {
            sheetId: requiredSheetId(ids, "PUBLIC_SUBMISSIONS"),
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 2,
            endColumnIndex: 3,
          },
          rows: [row([next.status])],
          fields: "userEnteredValue",
        },
      },
      {
        updateCells: {
          range: {
            sheetId: requiredSheetId(ids, "PUBLIC_SUBMISSIONS"),
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 4,
            endColumnIndex: 5,
          },
          rows: [row([String(next.version)])],
          fields: "userEnteredValue",
        },
      },
      {
        updateCells: {
          range: {
            sheetId: requiredSheetId(ids, "PUBLIC_SUBMISSIONS"),
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 17,
            endColumnIndex: 18,
          },
          rows: [row([next.updatedAt])],
          fields: "userEnteredValue",
        },
      },
    ];
    if (input.claimedBy !== undefined || input.claimedAt !== undefined) {
      requests.push({
        updateCells: {
          range: {
            sheetId: requiredSheetId(ids, "PUBLIC_SUBMISSIONS"),
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 14,
            endColumnIndex: 16,
          },
          rows: [row([next.claimedBy, next.claimedAt])],
          fields: "userEnteredValue",
        },
      });
    }
    if (input.supplementRequest) {
      requests.push(
        {
          appendCells: {
            sheetId: requiredSheetId(ids, "PUBLIC_SUPPLEMENT_REQUESTS"),
            rows: [
              row([
                input.supplementRequest.requestId,
                current.submissionId,
                input.supplementRequest.status,
                input.supplementRequest.reasonCode,
                input.supplementRequest.message,
                input.actorEmail,
                input.supplementRequest.requestedByDisplayName,
                input.supplementRequest.createdAt,
                input.supplementRequest.resolvedAt,
              ]),
            ],
            fields: "userEnteredValue",
          },
        },
        {
          appendCells: {
            sheetId: requiredSheetId(ids, "PUBLIC_SUPPLEMENT_ITEMS"),
            rows: input.supplementRequest.items.map((item) =>
              row([
                item.itemId,
                item.requestId,
                current.submissionId,
                item.itemType,
                item.targetEntityType,
                item.targetEntityId,
                item.fieldPath,
                item.documentType,
                item.reasonCode,
                item.instruction,
                item.status,
                input.supplementRequest!.createdAt,
                "",
              ]),
            ),
            fields: "userEnteredValue",
          },
        },
      );
    }
    requests.push(
      {
        appendCells: {
          sheetId: requiredSheetId(ids, "AUDIT_LOGS"),
          rows: [
            row([
              randomUUID(),
              now,
              input.actorEmail,
              input.auditAction,
              "PUBLIC_SUBMISSION",
              current.submissionId,
              input.requestId,
              JSON.stringify(input.auditMetadata ?? {}),
            ]),
          ],
          fields: "userEnteredValue",
        },
      },
      {
        appendCells: {
          sheetId: requiredSheetId(ids, "PUBLIC_STATUS_EVENTS"),
          rows: [
            row([
              input.timelineEvent.eventId,
              current.submissionId,
              input.timelineEvent.eventType,
              input.timelineEvent.label,
              input.actorEmail,
              input.timelineEvent.actorDisplayName,
              input.timelineEvent.message,
              input.timelineEvent.occurredAt,
              input.requestId,
            ]),
          ],
          fields: "userEnteredValue",
        },
      },
      {
        appendCells: {
          sheetId: requiredSheetId(ids, "REQUEST_LOG"),
          rows: [
            row([
              input.idempotencyKey,
              input.requestId,
              JSON.stringify({
                kind: "STAFF_ACTION",
                mutationHash: input.mutationHash,
                response: {
                  status: next.status,
                  version: next.version,
                  claimedBy: next.claimedBy || null,
                },
              }),
              now,
              new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            ]),
          ],
          fields: "userEnteredValue",
        },
      },
    );
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests },
    });
    return next;
  }

  async commitAccessSecretReset(input: {
    record: SubmissionRecord;
    accessCodeHash: string;
    actorEmail: string;
    requestId: string;
    idempotencyKey: string;
    mutationHash: string;
  }): Promise<SubmissionRecord> {
    const current = await this.findByLocator(input.record.submissionId, input.record.rowIndex);
    if (!current) throw new Error("Kh?ng t?m th?y b?n k? khai khi ??t l?i m? b? m?t.");
    const now = new Date().toISOString();
    const next: SubmissionRecord = {
      ...current,
      accessCodeHash: input.accessCodeHash,
      failedAttempts: 0,
      lockedUntil: "",
      accessVersion: current.accessVersion + 1,
      updatedAt: now,
    };
    const { sheets, ids } = await this.sheetsWithIds([
      "PUBLIC_SUBMISSIONS",
      "AUDIT_LOGS",
      "REQUEST_LOG",
    ]);
    const rowIndex = current.rowIndex;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            updateCells: {
              range: {
                sheetId: requiredSheetId(ids, "PUBLIC_SUBMISSIONS"),
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: 5,
                endColumnIndex: 8,
              },
              rows: [row([next.accessCodeHash, "0", ""])],
              fields: "userEnteredValue",
            },
          },
          {
            updateCells: {
              range: {
                sheetId: requiredSheetId(ids, "PUBLIC_SUBMISSIONS"),
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: 17,
                endColumnIndex: 18,
              },
              rows: [row([next.updatedAt])],
              fields: "userEnteredValue",
            },
          },
          {
            updateCells: {
              range: {
                sheetId: requiredSheetId(ids, "PUBLIC_SUBMISSIONS"),
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: 19,
                endColumnIndex: 20,
              },
              rows: [row([String(next.accessVersion)])],
              fields: "userEnteredValue",
            },
          },
          {
            appendCells: {
              sheetId: requiredSheetId(ids, "AUDIT_LOGS"),
              rows: [
                row([
                  randomUUID(),
                  now,
                  input.actorEmail,
                  "PUBLIC_ACCESS_SECRET_RESET",
                  "PUBLIC_SUBMISSION",
                  current.submissionId,
                  input.requestId,
                  JSON.stringify({ accessVersion: next.accessVersion, identityVerified: true }),
                ]),
              ],
              fields: "userEnteredValue",
            },
          },
          {
            appendCells: {
              sheetId: requiredSheetId(ids, "REQUEST_LOG"),
              rows: [
                row([
                  input.idempotencyKey,
                  input.requestId,
                  JSON.stringify({
                    kind: "ACCESS_SECRET_RESET",
                    mutationHash: input.mutationHash,
                    response: { accessVersion: next.accessVersion },
                  }),
                  now,
                  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                ]),
              ],
              fields: "userEnteredValue",
            },
          },
        ],
      },
    });
    return next;
  }
  async appendPendingIdentityIndex(input: {
    record: SubmissionRecord;
    citizenIdHmac: string;
  }): Promise<void> {
    const bucket = Number.parseInt(input.citizenIdHmac.slice(0, 2), 16);
    const column = columnName(bucket + 1);
    const { sheets } = this.workspace();
    await sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `PUBLIC_LOOKUP_INDEX!${column}:${column}`,
      valueInputOption: "RAW",
      insertDataOption: "OVERWRITE",
      requestBody: {
        values: [
          [
            JSON.stringify({
              kind: "PENDING",
              citizenIdHmac: input.citizenIdHmac,
              submissionId: input.record.submissionId,
              rowIndex: input.record.rowIndex,
            }),
          ],
        ],
      },
    });
  }

  async hasPendingIdentityMatch(
    citizenIdHmac: string,
    excludeSubmissionId: string,
  ): Promise<boolean> {
    const bucket = Number.parseInt(citizenIdHmac.slice(0, 2), 16);
    if (!Number.isInteger(bucket) || bucket < 0 || bucket > 255) return false;
    const column = columnName(bucket + 1);
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `PUBLIC_LOOKUP_INDEX!${column}2:${column}`,
    });
    for (const candidate of response.data.values ?? []) {
      try {
        const item = JSON.parse(readCell(candidate, 0)) as {
          kind?: string;
          citizenIdHmac?: string;
          submissionId?: string;
          rowIndex?: number;
        };
        // Cảnh báo khi cùng một CCCD đang có hồ sơ khác chờ xử lý — khớp theo CCCD, không theo tên/ngày sinh.
        if (
          item.kind !== "PENDING" ||
          item.citizenIdHmac !== citizenIdHmac ||
          !item.submissionId ||
          item.submissionId === excludeSubmissionId
        )
          continue;
        const record = await this.findByLocator(item.submissionId, Number(item.rowIndex) || 0);
        if (
          record &&
          ["SUBMITTED", "UNDER_REVIEW", "NEEDS_SUPPLEMENT", "RESUBMITTED", "ACCEPTING"].includes(
            record.status,
          )
        )
          return true;
      } catch {
        // Bỏ qua mục chỉ mục hỏng.
      }
    }
    return false;
  }

  async linkExistingCertificates(input: {
    submissionId: string;
    ownerId: string;
    existingRecordIds: readonly string[];
    outcome: "MATCHED_VERIFIED" | "WARN_PENDING";
  }): Promise<void> {
    if (!input.existingRecordIds.length) return;
    const { sheets } = this.workspace();
    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_EXISTING_RECORD_LINKS!A2:H",
    });
    const alreadyLinked = new Set(
      (existingResponse.data.values ?? [])
        .filter(
          (candidate) =>
            readCell(candidate, 1) === input.submissionId &&
            readCell(candidate, 2) === input.ownerId &&
            readCell(candidate, 5) === "ACTIVE",
        )
        .map((candidate) => readCell(candidate, 3)),
    );
    const pendingIds = [...new Set(input.existingRecordIds)].filter(
      (recordId) => !alreadyLinked.has(recordId),
    );
    if (!pendingIds.length) return;
    const now = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_EXISTING_RECORD_LINKS!A:H",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: pendingIds.map((existingRecordId) => [
          randomUUID(),
          input.submissionId,
          input.ownerId,
          existingRecordId,
          input.outcome,
          "ACTIVE",
          now,
          now,
        ]),
      },
    });
  }

  /**
   * Đọc **đầy đủ** mọi bản kê khai (gồm cả `draft_json`). Google Sheets không có truy vấn lọc/phân
   * trang phía máy chủ nên phải quét toàn bộ tab; chỉ dùng khi thật sự cần draft (xuất PL3, tìm kiếm
   * theo số GCN/tên chủ). Hàng chờ thông thường dùng {@link listSummaries} để khỏi tải cột nặng nhất.
   */
  async list(): Promise<SubmissionRecord[]> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_SUBMISSIONS!A2:U",
    });

    return (response.data.values ?? []).map((candidate, index) =>
      submissionFromRow(candidate, index + 1),
    );
  }

  /**
   * Đọc nhẹ cho hàng chờ: chỉ lấy cột A:R, bỏ hẳn `draft_json` (S) — cột chiếm gần như toàn bộ dung
   * lượng khi có 20k hồ sơ. Số GCN/tên chủ hiển thị được nạp sau cho đúng trang bằng
   * {@link getDraftDisplayFields}.
   */
  async listSummaries(): Promise<SubmissionSummary[]> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_SUBMISSIONS!A2:R",
    });
    return (response.data.values ?? []).map((candidate, index) => ({
      submissionId: readCell(candidate, 0),
      receiptCode: readCell(candidate, 1),
      status: (readCell(candidate, 2) || "DRAFT") as PublicStatus,
      phone: readCell(candidate, 3),
      version: Number(readCell(candidate, 4)) || 1,
      claimedBy: readCell(candidate, 14),
      updatedAt: readCell(candidate, 17),
      rowIndex: index + 1,
    }));
  }

  /**
   * Nạp số GCN + tên chủ đầu tiên cho đúng các dòng của một trang hàng chờ. Chỉ đọc ô `draft_json`
   * (cột S) của từng dòng qua `batchGet` nên chi phí tỉ lệ với cỡ trang (100), không phải cả 20k.
   */
  async getDraftDisplayFields(
    rowIndexes: readonly number[],
  ): Promise<Map<number, { issueNumber: string; ownerName: string }>> {
    const result = new Map<number, { issueNumber: string; ownerName: string }>();
    if (!rowIndexes.length) return result;
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: this.spreadsheetId,
      ranges: rowIndexes.map((rowIndex) => `PUBLIC_SUBMISSIONS!S${rowIndex + 1}`),
    });
    const valueRanges = response.data.valueRanges ?? [];
    rowIndexes.forEach((rowIndex, position) => {
      const raw = valueRanges[position]?.values?.[0]?.[0];
      const draft = typeof raw === "string" ? parseDraft(raw) : null;
      result.set(rowIndex, {
        issueNumber: draft?.certificate.issueNumber ?? "",
        ownerName: draft?.owners[0]?.fullName ?? "",
      });
    });
    return result;
  }

  /**
   * Cập nhật một transition của hàng chờ, giữ nguyên bản khai gốc. Sheets không có CAS thật;
   * caller phải gửi version đã đọc và mọi hành động đều được audit riêng ở tầng route.
   */
  async transition(input: {
    record: SubmissionRecord;
    expectedVersion: number;
    status: PublicStatus;
    claimedBy?: string;
    claimedAt?: string;
    officialCaseId?: string;
    acceptStep?: string;
  }): Promise<SubmissionRecord> {
    if (input.record.version !== input.expectedVersion) {
      throw new SubmissionVersionConflictError();
    }
    const { sheets } = this.workspace();
    const now = new Date().toISOString();
    const nextVersion = input.record.version + 1;
    const next = {
      ...input.record,
      status: input.status,
      version: nextVersion,
      claimedBy: input.claimedBy ?? input.record.claimedBy,
      claimedAt: input.claimedAt ?? input.record.claimedAt,
      officialCaseId: input.officialCaseId ?? input.record.officialCaseId,
      acceptStep: input.acceptStep ?? input.record.acceptStep,
      updatedAt: now,
    };

    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `PUBLIC_SUBMISSIONS!A${input.record.rowIndex + 1}:U${input.record.rowIndex + 1}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            next.submissionId,
            next.receiptCode,
            next.status,
            next.phone,
            String(next.version),
            next.accessCodeHash,
            String(next.failedAttempts),
            next.lockedUntil,
            next.consentVersion,
            next.consentedAt,
            next.retentionUntil,
            next.officialCaseId,
            next.driveFolderId,
            next.acceptStep,
            next.claimedBy,
            next.claimedAt,
            next.createdAt,
            next.updatedAt,
            JSON.stringify(next.draft),
            String(next.accessVersion),
            JSON.stringify(next.fileSummaries),
          ],
        ],
      },
    });
    return next;
  }

  async appendTimelineEvent(
    submissionId: string,
    event: PublicTimelineEvent,
    actorEmail: string,
    requestId: string,
  ): Promise<void> {
    const { sheets } = this.workspace();
    await sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_STATUS_EVENTS!A:I",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            event.eventId,
            submissionId,
            event.eventType,
            event.label,
            actorEmail,
            event.actorDisplayName,
            event.message,
            event.occurredAt,
            requestId,
          ],
        ],
      },
    });
  }

  async listTimeline(submissionId: string): Promise<PublicTimelineEvent[]> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_STATUS_EVENTS!A2:I",
    });
    return (response.data.values ?? [])
      .filter((candidate) => readCell(candidate, 1) === submissionId)
      .map((candidate) => ({
        eventId: readCell(candidate, 0),
        eventType: readCell(candidate, 2),
        label: readCell(candidate, 3),
        actorDisplayName: readCell(candidate, 5) || "Cán bộ phường",
        message: readCell(candidate, 6),
        occurredAt: readCell(candidate, 7),
      }))
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  async createSupplementRequest(input: {
    submissionId: string;
    request: SupplementRequest;
    actorEmail: string;
  }): Promise<void> {
    const { sheets } = this.workspace();
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: "sheets.properties(sheetId,title)",
    });
    const ids = new Map(
      (spreadsheet.data.sheets ?? []).map((sheet) => [
        sheet.properties?.title ?? "",
        sheet.properties?.sheetId ?? -1,
      ]),
    );
    const requestSheetId = ids.get("PUBLIC_SUPPLEMENT_REQUESTS");
    const itemSheetId = ids.get("PUBLIC_SUPPLEMENT_ITEMS");
    if (
      typeof requestSheetId !== "number" ||
      requestSheetId < 0 ||
      typeof itemSheetId !== "number" ||
      itemSheetId < 0
    ) {
      throw new Error("Google Sheets thiếu tab yêu cầu bổ sung.");
    }
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            appendCells: {
              sheetId: requestSheetId,
              rows: [
                row([
                  input.request.requestId,
                  input.submissionId,
                  input.request.status,
                  input.request.reasonCode,
                  input.request.message,
                  input.actorEmail,
                  input.request.requestedByDisplayName,
                  input.request.createdAt,
                  input.request.resolvedAt,
                ]),
              ],
              fields: "userEnteredValue",
            },
          },
          {
            appendCells: {
              sheetId: itemSheetId,
              rows: input.request.items.map((item) =>
                row([
                  item.itemId,
                  item.requestId,
                  input.submissionId,
                  item.itemType,
                  item.targetEntityType,
                  item.targetEntityId,
                  item.fieldPath,
                  item.documentType,
                  item.reasonCode,
                  item.instruction,
                  item.status,
                  input.request.createdAt,
                  "",
                ]),
              ),
              fields: "userEnteredValue",
            },
          },
        ],
      },
    });
  }

  async getOpenSupplementRequest(submissionId: string): Promise<SupplementRequest | null> {
    const { sheets } = this.workspace();
    const [requestsResponse, itemsResponse] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "PUBLIC_SUPPLEMENT_REQUESTS!A2:I",
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "PUBLIC_SUPPLEMENT_ITEMS!A2:M",
      }),
    ]);
    const requestRow = [...(requestsResponse.data.values ?? [])]
      .reverse()
      .find(
        (candidate) => readCell(candidate, 1) === submissionId && readCell(candidate, 2) === "OPEN",
      );
    if (!requestRow) return null;
    const requestId = readCell(requestRow, 0);
    const items: SupplementItem[] = (itemsResponse.data.values ?? [])
      .filter(
        (candidate) => readCell(candidate, 1) === requestId && readCell(candidate, 10) === "OPEN",
      )
      .map((candidate) => ({
        itemId: readCell(candidate, 0),
        requestId,
        itemType: readCell(candidate, 3) as SupplementItem["itemType"],
        targetEntityType: readCell(candidate, 4) as SupplementItem["targetEntityType"],
        targetEntityId: readCell(candidate, 5),
        fieldPath: readCell(candidate, 6),
        documentType: readCell(candidate, 7) as SupplementItem["documentType"],
        reasonCode: readCell(candidate, 8) as SupplementItem["reasonCode"],
        instruction: readCell(candidate, 9),
        status: "OPEN",
      }));
    return {
      requestId,
      status: "OPEN",
      reasonCode: readCell(requestRow, 3) as SupplementRequest["reasonCode"],
      message: readCell(requestRow, 4),
      requestedByDisplayName: readCell(requestRow, 6) || "Cán bộ phường",
      createdAt: readCell(requestRow, 7),
      resolvedAt: readCell(requestRow, 8),
      items,
    };
  }

  async resolveOpenSupplementRequest(submissionId: string): Promise<void> {
    const { sheets } = this.workspace();
    const [requestsResponse, itemsResponse] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "PUBLIC_SUPPLEMENT_REQUESTS!A2:I",
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "PUBLIC_SUPPLEMENT_ITEMS!A2:M",
      }),
    ]);
    const requestRows = requestsResponse.data.values ?? [];
    let requestIndex = -1;
    for (let index = requestRows.length - 1; index >= 0; index -= 1) {
      if (
        readCell(requestRows[index], 1) === submissionId &&
        readCell(requestRows[index], 2) === "OPEN"
      ) {
        requestIndex = index;
        break;
      }
    }
    if (requestIndex < 0) return;
    const requestId = readCell(requestRows[requestIndex], 0);
    const now = new Date().toISOString();
    const data: sheets_v4.Schema$ValueRange[] = [
      {
        range: `PUBLIC_SUPPLEMENT_REQUESTS!C${requestIndex + 2}:C${requestIndex + 2}`,
        values: [["RESOLVED"]],
      },
      {
        range: `PUBLIC_SUPPLEMENT_REQUESTS!I${requestIndex + 2}:I${requestIndex + 2}`,
        values: [[now]],
      },
    ];
    (itemsResponse.data.values ?? []).forEach((candidate, index) => {
      if (readCell(candidate, 1) !== requestId || readCell(candidate, 10) !== "OPEN") return;
      data.push(
        { range: `PUBLIC_SUPPLEMENT_ITEMS!K${index + 2}:K${index + 2}`, values: [["RESOLVED"]] },
        { range: `PUBLIC_SUPPLEMENT_ITEMS!M${index + 2}:M${index + 2}`, values: [[now]] },
      );
    });
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { valueInputOption: "RAW", data },
    });
  }

  async appendAudit(input: {
    actorEmail: string;
    action: string;
    entityId: string;
    requestId: string;
    metadata?: Record<string, string | number | boolean>;
  }): Promise<void> {
    const { sheets } = this.workspace();
    await sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: "AUDIT_LOGS!A:H",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            randomUUID(),
            new Date().toISOString(),
            input.actorEmail,
            input.action,
            "PUBLIC_SUBMISSION",
            input.entityId,
            input.requestId,
            JSON.stringify(input.metadata ?? {}),
          ],
        ],
      },
    });
  }

  /** Ghi một dòng nhật ký công việc xuất vào `EXPORT_JOBS` (append-only, có checksum + phạm vi). */
  async appendExportJob(job: ExportJobRecord): Promise<void> {
    const { sheets } = this.workspace();
    await sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: "EXPORT_JOBS!A:M",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            job.exportJobId,
            job.exportType,
            job.status,
            job.driveFileId,
            job.fileName,
            String(job.rowCount),
            String(job.submissionCount),
            String(job.warningCount),
            job.checksumSha256,
            job.actorEmail,
            job.scopeJson,
            job.createdAt,
            job.completedAt,
          ],
        ],
      },
    });
  }

  /** Ghi đè cả dòng: nháp thay đổi liên tục nên cập nhật theo dòng rẻ hơn theo ô. */
  async saveDraft(
    record: SubmissionRecord,
    draft: IntakeDraft,
    status: PublicStatus,
  ): Promise<number> {
    const { sheets } = this.workspace();
    const now = new Date().toISOString();
    const nextVersion = record.version + 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `PUBLIC_SUBMISSIONS!A${record.rowIndex + 1}:U${record.rowIndex + 1}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            record.submissionId,
            record.receiptCode,
            status,
            draft.phone || record.phone,
            String(nextVersion),
            record.accessCodeHash,
            String(record.failedAttempts),
            record.lockedUntil,
            record.consentVersion,
            record.consentedAt,
            record.retentionUntil,
            record.officialCaseId,
            record.driveFolderId,
            "",
            "",
            "",
            record.createdAt,
            now,
            JSON.stringify(draft),
            String(record.accessVersion),
            JSON.stringify(record.fileSummaries),
          ],
        ],
      },
    });

    return nextVersion;
  }

  async appendFile(
    file: Omit<StoredFile, "status">,
    record?: SubmissionRecord,
  ): Promise<PublicFileSummary> {
    const { sheets } = this.workspace();
    const now = new Date().toISOString();
    const summary: PublicFileSummary = {
      fileId: file.fileId,
      ownerId: file.ownerId,
      documentType: file.documentType,
      status: "UPLOADED",
      sizeBytes: file.sizeBytes,
      checksum: file.checksum,
      createdAt: now,
      updatedAt: now,
      driveFileId: file.driveFileId,
      mimeType: file.mimeType,
    };

    if (!record) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: "PUBLIC_FILES!A:M",
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [
            [
              file.fileId,
              file.submissionId,
              file.documentType,
              "ORIGINAL",
              file.driveFileId,
              file.mimeType,
              String(file.sizeBytes),
              file.checksum,
              "UPLOADED",
              now,
              now,
              file.ownerId,
              file.fileName,
            ],
          ],
        },
      });
      return summary;
    }

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: "sheets.properties(sheetId,title)",
    });
    const ids = new Map(
      (spreadsheet.data.sheets ?? []).map((sheet) => [
        sheet.properties?.title ?? "",
        sheet.properties?.sheetId ?? -1,
      ]),
    );
    const filesSheetId = ids.get("PUBLIC_FILES");
    const submissionsSheetId = ids.get("PUBLIC_SUBMISSIONS");
    if (
      typeof filesSheetId !== "number" ||
      filesSheetId < 0 ||
      typeof submissionsSheetId !== "number" ||
      submissionsSheetId < 0
    ) {
      throw new Error("Google Sheets thiếu tab file hoặc bản kê khai.");
    }
    // Bản tóm tắt là cache. Luôn dựng lại từ PUBLIC_FILES trước khi ghi để lượt upload sau không
    // vô tình ghi đè một file vừa hoàn tất nhưng record trong request đã được đọc từ trước đó.
    const storedFiles = await this.listFiles(file.submissionId, true);
    const nextSummaries = [
      ...storedFiles.map((candidate) =>
        candidate.status === "UPLOADED" &&
        candidate.ownerId === file.ownerId &&
        candidate.documentType === file.documentType &&
        file.documentType !== "CERTIFICATE"
          ? { ...candidate, status: "REPLACED" as const, updatedAt: now }
          : candidate,
      ),
      summary,
    ];
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            appendCells: {
              sheetId: filesSheetId,
              rows: [
                row([
                  file.fileId,
                  file.submissionId,
                  file.documentType,
                  "ORIGINAL",
                  file.driveFileId,
                  file.mimeType,
                  String(file.sizeBytes),
                  file.checksum,
                  "UPLOADED",
                  now,
                  now,
                  file.ownerId,
                  file.fileName,
                ]),
              ],
              fields: "userEnteredValue",
            },
          },
          {
            updateCells: {
              range: {
                sheetId: submissionsSheetId,
                startRowIndex: record.rowIndex,
                endRowIndex: record.rowIndex + 1,
                startColumnIndex: 20,
                endColumnIndex: 21,
              },
              rows: [row([JSON.stringify(nextSummaries)])],
              fields: "userEnteredValue",
            },
          },
        ],
      },
    });
    return summary;
  }

  async listFiles(submissionId: string, includeInactive = false): Promise<StoredFile[]> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_FILES!A2:M",
    });

    return (response.data.values ?? [])
      .filter(
        (candidate) =>
          readCell(candidate, 1) === submissionId &&
          (includeInactive || readCell(candidate, 8) === "UPLOADED"),
      )
      .map((candidate) => ({
        fileId: readCell(candidate, 0),
        submissionId: readCell(candidate, 1),
        ownerId: readCell(candidate, 11),
        documentType: readCell(candidate, 2) as StoredFile["documentType"],
        driveFileId: readCell(candidate, 4),
        mimeType: readCell(candidate, 5),
        sizeBytes: Number(readCell(candidate, 6)) || 0,
        checksum: readCell(candidate, 7),
        fileName: readCell(candidate, 12),
        status: readCell(candidate, 8) as StoredFile["status"],
        createdAt: readCell(candidate, 9),
        updatedAt: readCell(candidate, 10),
      }));
  }

  /** Ảnh cũ chỉ được chuyển `REPLACED` sau khi ảnh mới đã xác minh và được lưu thành công. */
  async markFileReplaced(submissionId: string, fileId: string): Promise<void> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_FILES!A2:M",
    });
    const index = (response.data.values ?? []).findIndex(
      (candidate) =>
        readCell(candidate, 0) === fileId &&
        readCell(candidate, 1) === submissionId &&
        readCell(candidate, 8) === "UPLOADED",
    );
    if (index < 0) throw new Error("Không tìm thấy ảnh CCCD cần thay.");
    const existing = response.data.values?.[index] ?? [];
    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `PUBLIC_FILES!I${index + 2}:K${index + 2}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["REPLACED", readCell(existing, 9), new Date().toISOString()]],
      },
    });
  }

  /**
   * Xóa mềm một ảnh: đổi trạng thái sang `DELETED` để nó không còn được coi là đã nộp và không
   * trải phẳng khi gửi. Không xóa cứng dòng hay file Drive — giữ vết cho cán bộ đối chiếu.
   */
  async markFileDeleted(submissionId: string, fileId: string): Promise<void> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_FILES!A2:M",
    });
    const index = (response.data.values ?? []).findIndex(
      (candidate) =>
        readCell(candidate, 0) === fileId &&
        readCell(candidate, 1) === submissionId &&
        readCell(candidate, 8) === "UPLOADED",
    );
    if (index < 0) throw new Error("Không tìm thấy ảnh cần xóa.");
    const existing = response.data.values?.[index] ?? [];
    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `PUBLIC_FILES!I${index + 2}:K${index + 2}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["DELETED", readCell(existing, 9), new Date().toISOString()]],
      },
    });
  }

  /**
   * Chuyển nháp JSON thành các dòng chuẩn hóa và khóa bản khai. Toàn bộ đi trong **một**
   * `batchUpdate` để một thao tác nghiệp vụ chỉ tốn một lần ghi (PLAN_NL §9.1).
   */
  async submit(input: {
    record: SubmissionRecord;
    draft: IntakeDraft;
    status: "SUBMITTED" | "RESUBMITTED";
    timelineEvent: PublicTimelineEvent;
    actorEmail: string;
    requestId: string;
    pendingIdentityHmacs?: string[];
  }): Promise<void> {
    const { ids } = await this.sheetsWithIds([
      "PUBLIC_SUBMISSIONS",
      "PUBLIC_CERTIFICATES",
      "PUBLIC_OWNERS",
      "PUBLIC_PARCELS",
      "PUBLIC_LAND_USES",
      "PUBLIC_ASSETS",
      "PUBLIC_STATUS_EVENTS",
      "AUDIT_LOGS",
      "PUBLIC_LOOKUP_INDEX",
      "PUBLIC_SUPPLEMENT_REQUESTS",
      "PUBLIC_SUPPLEMENT_ITEMS"
    ]);
    const { record, draft, status, timelineEvent, actorEmail, requestId, pendingIdentityHmacs } = input;
    const now = new Date().toISOString();

    const sheetId = (title: string): number => requiredSheetId(ids, title);

    const requests: sheets_v4.Schema$Request[] = [
      {
        updateCells: {
          range: {
            sheetId: sheetId("PUBLIC_SUBMISSIONS"),
            startRowIndex: record.rowIndex,
            endRowIndex: record.rowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: SUBMISSION_COLUMNS,
          },
          rows: [
            row([
              record.submissionId,
              record.receiptCode,
              status,
              draft.phone || record.phone,
              String(record.version + 1),
              record.accessCodeHash,
              String(record.failedAttempts),
              record.lockedUntil,
              record.consentVersion,
              record.consentedAt,
              record.retentionUntil,
              record.officialCaseId,
              record.driveFolderId,
              "",
              "",
              "",
              record.createdAt,
              now,
              JSON.stringify(draft),
              String(record.accessVersion),
              JSON.stringify(record.fileSummaries),
            ]),
          ],
          fields: "userEnteredValue",
        },
      },
    ];

    // Các tab con chỉ được tạo ở lần nộp đầu. Khi bổ sung, draft_json mới là ảnh chụp đầy đủ và
    // là nguồn mà cán bộ/saga đọc; không append lại các dòng con vì sẽ tạo owner/thửa/GCN trùng.
    // Migration chuẩn hóa khi tiếp nhận chính thức sẽ lấy phiên bản draft mới nhất.
    if (status === "SUBMITTED") {
      requests.push(
        {
          appendCells: {
            sheetId: sheetId("PUBLIC_CERTIFICATES"),
            rows: [
              row([
                randomUUID(),
                record.submissionId,
                draft.certificate.issueNumber,
                draft.certificate.issueDate,
                draft.certificate.registryNumber,
                now,
              ]),
            ],
            fields: "userEnteredValue",
          },
        },
        {
          appendCells: {
            sheetId: sheetId("PUBLIC_OWNERS"),
            rows: draft.owners.map((owner) =>
              row([
                owner.id,
                record.submissionId,
                owner.ownerType,
                owner.fullName,
                owner.identityNumber,
                owner.roleOnCertificate,
                now,
                owner.dateOfBirth,
                owner.gender,
                owner.residenceAddress,
                owner.identitySource,
                owner.qrPayloadHash,
                owner.qrDecoderVersion,
                owner.qrParserVersion,
                owner.identityStatus,
                owner.identityConfirmedAt,
                owner.hasDistinctCurrentUser ? "TRUE" : "FALSE",
                owner.currentUserName,
                owner.currentUserCitizenId,
                owner.currentUserAddress,
                owner.changeReason,
              ]),
            ),
            fields: "userEnteredValue",
          },
        },
        {
          appendCells: {
            sheetId: sheetId("PUBLIC_PARCELS"),
            rows: draft.parcels.map((parcel) =>
              row([
                parcel.id,
                record.submissionId,
                parcel.parcelIdCode,
                parcel.mapSheetNumber,
                parcel.parcelNumber,
                parcel.addressOnCertificate,
                parcel.addressTwoLevel,
                parcel.area,
                now,
                parcel.oldWard,
              ]),
            ),
            fields: "userEnteredValue",
          },
        },
        {
          appendCells: {
            sheetId: sheetId("PUBLIC_LAND_USES"),
            rows: draft.parcels.flatMap((parcel) =>
              parcel.landUses.map((landUse) =>
                row([
                  landUse.id,
                  record.submissionId,
                  parcel.id,
                  landUse.purposeCode,
                  landUse.originCode,
                  landUse.formCode,
                  landUse.termCode,
                  landUse.area,
                  now,
                ]),
              ),
            ),
            fields: "userEnteredValue",
          },
        },
      );
    }

    if (status === "SUBMITTED" && draft.assets.length > 0) {
      requests.push({
        appendCells: {
          sheetId: sheetId("PUBLIC_ASSETS"),
          rows: draft.assets.map((asset) =>
            row([asset.id, record.submissionId, asset.assetType, asset.description, now]),
          ),
          fields: "userEnteredValue",
        },
      });
    }

    // Ghi sự kiện trạng thái (Timeline)
    requests.push({
      appendCells: {
        sheetId: sheetId("PUBLIC_STATUS_EVENTS"),
        rows: [
          row([
            timelineEvent.eventId,
            record.submissionId,
            timelineEvent.eventType,
            timelineEvent.label,
            actorEmail,
            timelineEvent.actorDisplayName,
            timelineEvent.message,
            timelineEvent.occurredAt,
            requestId,
          ]),
        ],
        fields: "userEnteredValue",
      },
    });

    // Ghi Audit
    requests.push({
      appendCells: {
        sheetId: sheetId("AUDIT_LOGS"),
        rows: [
          row([
            randomUUID(),
            now,
            actorEmail,
            status === "RESUBMITTED" ? "PUBLIC_SUBMISSION_RESUBMITTED" : "PUBLIC_SUBMISSION_SUBMITTED",
            "PUBLIC_SUBMISSION",
            record.submissionId,
            requestId,
            JSON.stringify({}),
          ]),
        ],
        fields: "userEnteredValue",
      },
    });

    // Giải quyết yêu cầu bổ sung nếu RESUBMITTED
    if (status === "RESUBMITTED") {
      const [requestsResponse, itemsResponse] = await Promise.all([
        this.workspace().sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: "PUBLIC_SUPPLEMENT_REQUESTS!A2:I",
        }),
        this.workspace().sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: "PUBLIC_SUPPLEMENT_ITEMS!A2:M",
        }),
      ]);
      const requestRows = requestsResponse.data.values ?? [];
      let requestIndex = -1;
      for (let index = requestRows.length - 1; index >= 0; index -= 1) {
        if (
          readCell(requestRows[index], 1) === record.submissionId &&
          readCell(requestRows[index], 2) === "OPEN"
        ) {
          requestIndex = index;
          break;
        }
      }
      if (requestIndex >= 0) {
        const suppRequestId = readCell(requestRows[requestIndex], 0);
        requests.push({
          updateCells: {
            range: {
              sheetId: sheetId("PUBLIC_SUPPLEMENT_REQUESTS"),
              startRowIndex: requestIndex + 1, // index là 0-based từ row 2
              endRowIndex: requestIndex + 2,
              startColumnIndex: 2,
              endColumnIndex: 3,
            },
            rows: [row(["RESOLVED"])],
            fields: "userEnteredValue",
          },
        });
        requests.push({
          updateCells: {
            range: {
              sheetId: sheetId("PUBLIC_SUPPLEMENT_REQUESTS"),
              startRowIndex: requestIndex + 1,
              endRowIndex: requestIndex + 2,
              startColumnIndex: 8,
              endColumnIndex: 9,
            },
            rows: [row([now])],
            fields: "userEnteredValue",
          },
        });
        (itemsResponse.data.values ?? []).forEach((candidate, index) => {
          if (readCell(candidate, 1) !== suppRequestId || readCell(candidate, 10) !== "OPEN") return;
          requests.push(
            {
              updateCells: {
                range: {
                  sheetId: sheetId("PUBLIC_SUPPLEMENT_ITEMS"),
                  startRowIndex: index + 1,
                  endRowIndex: index + 2,
                  startColumnIndex: 10,
                  endColumnIndex: 11,
                },
                rows: [row(["RESOLVED"])],
                fields: "userEnteredValue",
              },
            },
            {
              updateCells: {
                range: {
                  sheetId: sheetId("PUBLIC_SUPPLEMENT_ITEMS"),
                  startRowIndex: index + 1,
                  endRowIndex: index + 2,
                  startColumnIndex: 12,
                  endColumnIndex: 13,
                },
                rows: [row([now])],
                fields: "userEnteredValue",
              },
            }
          );
        });
      }
    }

    await this.workspace().sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests },
    });

    // PUBLIC_LOOKUP_INDEX chia bucket theo cột (byte đầu của HMAC) nên không thể gộp vào batch bằng
    // appendCells — cái đó luôn ghi vào cột A và phá vỡ bucketing. Ghi riêng theo đúng cột bucket để
    // hasPendingIdentityMatch đọc lại được. Đây là chỉ mục cảnh báo mềm, không cần cùng batch với hồ sơ.
    if (status === "SUBMITTED" && pendingIdentityHmacs && pendingIdentityHmacs.length > 0) {
      for (const hmac of pendingIdentityHmacs) {
        await this.appendPendingIdentityIndex({ record, citizenIdHmac: hmac });
      }
    }
  }

  private get spreadsheetId(): string {
    return this.environment.GOOGLE_SHEETS_SPREADSHEET_ID;
  }

  private async sheetsWithIds(titles: readonly string[]): Promise<{
    sheets: sheets_v4.Sheets;
    ids: Map<string, number>;
  }> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: "sheets.properties(sheetId,title)",
    });
    const ids = new Map(
      (response.data.sheets ?? []).map((sheet) => [
        sheet.properties?.title ?? "",
        sheet.properties?.sheetId ?? -1,
      ]),
    );
    for (const title of titles) requiredSheetId(ids, title);
    return { sheets, ids };
  }
  private workspace() {
    return createGoogleWorkspaceClient({
      clientId: this.environment.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: this.environment.GOOGLE_DRIVE_CLIENT_SECRET,
      refreshToken: this.environment.GOOGLE_DRIVE_REFRESH_TOKEN,
    });
  }
}

export function getPublicIntakeRepository(): PublicIntakeRepository {
  return new PublicIntakeRepository();
}

export class SubmissionVersionConflictError extends Error {
  constructor() {
    super("Bản kê khai đã được thay đổi bởi cán bộ khác.");
    this.name = "SubmissionVersionConflictError";
  }
}
