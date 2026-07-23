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

export interface StoredFile {
  readonly fileId: string;
  readonly submissionId: string;
  readonly ownerId: string;
  readonly documentType: "CITIZEN_ID_FRONT" | "CITIZEN_ID_BACK" | "CERTIFICATE";
  readonly driveFileId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
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

function submissionValues(record: SubmissionRecord): string[] {
  return [
    record.submissionId,
    record.receiptCode,
    record.status,
    record.phone,
    String(record.version),
    record.accessCodeHash,
    String(record.failedAttempts),
    record.lockedUntil,
    record.consentVersion,
    record.consentedAt,
    record.retentionUntil,
    record.officialCaseId,
    record.driveFolderId,
    record.acceptStep,
    record.claimedBy,
    record.claimedAt,
    record.createdAt,
    record.updatedAt,
    JSON.stringify(record.draft),
    String(record.accessVersion),
    JSON.stringify(record.fileSummaries),
  ];
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
    const now = new Date().toISOString();
    const next: SubmissionRecord = {
      ...record,
      version: record.version + 1,
      failedAttempts: input.failedAttempts ?? record.failedAttempts,
      lockedUntil: input.lockedUntil ?? record.lockedUntil,
      accessCodeHash: input.accessCodeHash ?? record.accessCodeHash,
      accessVersion: input.incrementAccessVersion ? record.accessVersion + 1 : record.accessVersion,
      updatedAt: now,
    };
    const { sheets } = this.workspace();
    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `PUBLIC_SUBMISSIONS!A${record.rowIndex + 1}:U${record.rowIndex + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: [submissionValues(next)] },
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
    return (recordsResponse.data.values ?? [])
      .filter(
        (candidate) =>
          recordIds.has(readCell(candidate, 0)) && readCell(candidate, 5) === "VERIFIED",
      )
      .map((candidate) => ({
        existingRecordId: readCell(candidate, 0),
        issueNumber: readCell(candidate, 1),
        issueDate: readCell(candidate, 3),
        registryNumber: readCell(candidate, 4),
      }));
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

  /** Hàng chờ cán bộ. Tối đa 500 bản kê khai ở pilot nên đọc theo lô, không phân trang bằng offset. */
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
        range: "PUBLIC_FILES!A:L",
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
      range: "PUBLIC_FILES!A2:L",
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
        status: readCell(candidate, 8) as StoredFile["status"],
        createdAt: readCell(candidate, 9),
        updatedAt: readCell(candidate, 10),
      }));
  }

  /** CCCD chỉ được thay sau khi ảnh mới đã xác minh và được lưu thành công. */
  async markFileReplaced(submissionId: string, fileId: string): Promise<void> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_FILES!A2:L",
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
   * Chuyển nháp JSON thành các dòng chuẩn hóa và khóa bản khai. Toàn bộ đi trong **một**
   * `batchUpdate` để một thao tác nghiệp vụ chỉ tốn một lần ghi (PLAN_NL §9.1).
   */
  async submit(
    record: SubmissionRecord,
    draft: IntakeDraft,
    status: "SUBMITTED" | "RESUBMITTED" = "SUBMITTED",
  ): Promise<void> {
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
    const sheetId = (title: string): number => {
      const id = ids.get(title);
      if (typeof id !== "number" || id < 0) {
        throw new Error(`Google Sheets thiếu tab ${title}.`);
      }
      return id;
    };

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

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests },
    });
  }

  private get spreadsheetId(): string {
    return this.environment.GOOGLE_SHEETS_SPREADSHEET_ID;
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
