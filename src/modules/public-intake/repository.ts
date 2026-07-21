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
  readonly driveFolderId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly draft: IntakeDraft | null;
  /** Số dòng trong sheet (1-based, bỏ header) — chỉ dùng nội bộ để ghi đè. */
  readonly rowIndex: number;
}

export interface StoredFile {
  readonly fileId: string;
  readonly submissionId: string;
  readonly documentType: "CITIZEN_ID_FRONT" | "CERTIFICATE";
  readonly driveFileId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly status: "UPLOADED" | "DELETED";
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
    phone: string;
    driveFolderId: string;
    draft: IntakeDraft;
    consentVersion: string;
  }): Promise<void> {
    const { sheets } = this.workspace();
    const now = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_SUBMISSIONS!A:S",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
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
          ],
        ],
      },
    });
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
      driveFolderId: readCell(found, 12),
      createdAt: readCell(found, 16),
      updatedAt: readCell(found, 17),
      draft: parseDraft(readCell(found, 18)),
      rowIndex: index + 1,
    };
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
            "0",
            "",
            "",
            "",
            "",
            "",
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
      range: "PUBLIC_FILES!A:K",
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
          ],
        ],
      },
    });
  }

  async listFiles(submissionId: string): Promise<StoredFile[]> {
    const { sheets } = this.workspace();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: "PUBLIC_FILES!A2:K",
    });

    return (response.data.values ?? [])
      .filter(
        (candidate) =>
          readCell(candidate, 1) === submissionId && readCell(candidate, 8) !== "DELETED",
      )
      .map((candidate) => ({
        fileId: readCell(candidate, 0),
        submissionId: readCell(candidate, 1),
        documentType: readCell(candidate, 2) as StoredFile["documentType"],
        driveFileId: readCell(candidate, 4),
        mimeType: readCell(candidate, 5),
        sizeBytes: Number(readCell(candidate, 6)) || 0,
        checksum: readCell(candidate, 7),
        status: "UPLOADED" as const,
      }));
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
              "0",
              "",
              "",
              "",
              "",
              "",
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
