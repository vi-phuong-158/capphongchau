import { randomUUID } from "node:crypto";

import type { sheets_v4 } from "googleapis";

import { loadGoogleStorageEnvironment, type GoogleStorageEnvironment } from "@/modules/common/env";
import { createGoogleWorkspaceClient } from "@/modules/google/workspace-client";

import type { IntakeDraft } from "./types";

export const PUBLIC_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_SUPPLEMENT",
  "RESUBMITTED",
  "ACCEPTING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
] as const;

export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

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
}

export interface StoredCreationRequest {
  readonly submissionId: string;
  readonly receiptCode: string;
  readonly mutationHash: string;
}

const SUBMISSION_COLUMNS = 19;

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

function parseDraft(value: string): IntakeDraft | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as IntakeDraft;
  } catch {
    return null;
  }
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
      range: "PUBLIC_SUBMISSIONS!A2:S",
    });

    const rows = response.data.values ?? [];
    const index = rows.findIndex((candidate) => readCell(candidate, 0) === submissionId);
    if (index < 0) {
      return null;
    }

    const found = rows[index];
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
      driveFolderId: readCell(found, 12),
      officialCaseId: readCell(found, 11),
      acceptStep: readCell(found, 13),
      claimedBy: readCell(found, 14),
      claimedAt: readCell(found, 15),
      createdAt: readCell(found, 16),
      updatedAt: readCell(found, 17),
      draft: parseDraft(readCell(found, 18)),
      rowIndex: index + 1,
    };
  }

  /** Hàng chờ cán bộ. Tối đa 500 bản kê khai ở pilot nên đọc theo lô, không phân trang bằng offset. */
  async list(): Promise<SubmissionRecord[]> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_SUBMISSIONS!A2:S",
    });

    return (response.data.values ?? []).map((candidate, index) => ({
      submissionId: readCell(candidate, 0),
      receiptCode: readCell(candidate, 1),
      status: (readCell(candidate, 2) || "DRAFT") as PublicStatus,
      phone: readCell(candidate, 3),
      version: Number(readCell(candidate, 4)) || 1,
      accessCodeHash: readCell(candidate, 5),
      failedAttempts: Number(readCell(candidate, 6)) || 0,
      lockedUntil: readCell(candidate, 7),
      consentVersion: readCell(candidate, 8),
      consentedAt: readCell(candidate, 9),
      retentionUntil: readCell(candidate, 10),
      driveFolderId: readCell(candidate, 12),
      officialCaseId: readCell(candidate, 11),
      acceptStep: readCell(candidate, 13),
      claimedBy: readCell(candidate, 14),
      claimedAt: readCell(candidate, 15),
      createdAt: readCell(candidate, 16),
      updatedAt: readCell(candidate, 17),
      draft: parseDraft(readCell(candidate, 18)),
      rowIndex: index + 1,
    }));
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
      range: `PUBLIC_SUBMISSIONS!A${input.record.rowIndex + 1}:S${input.record.rowIndex + 1}`,
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
          ],
        ],
      },
    });
    return next;
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
      range: `PUBLIC_SUBMISSIONS!A${record.rowIndex + 1}:S${record.rowIndex + 1}`,
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
          ],
        ],
      },
    });

    return nextVersion;
  }

  async appendFile(file: Omit<StoredFile, "status">): Promise<void> {
    const { sheets } = this.workspace();
    const now = new Date().toISOString();

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
  }

  async listFiles(submissionId: string): Promise<StoredFile[]> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_FILES!A2:L",
    });

    return (response.data.values ?? [])
      .filter(
        (candidate) =>
          readCell(candidate, 1) === submissionId && readCell(candidate, 8) === "UPLOADED",
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
        status: "UPLOADED" as const,
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
  async submit(record: SubmissionRecord, draft: IntakeDraft): Promise<void> {
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
              "SUBMITTED",
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
            ]),
          ],
          fields: "userEnteredValue",
        },
      },
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
    ];

    if (draft.assets.length > 0) {
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
