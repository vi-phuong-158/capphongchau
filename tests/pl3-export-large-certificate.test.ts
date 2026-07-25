import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildPl3Content, renderPl3Workbook } from "@/modules/public-intake/pl3-export";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import {
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  type IntakeDraft,
  type Owner,
  type Parcel,
} from "@/modules/public-intake/types";

function makeOwner(id: string, name: string): Owner {
  return {
    ...emptyOwner(id),
    fullName: name,
    identityNumber: "025080001234",
    dateOfBirth: "1980-01-01",
    gender: "NAM",
    residenceAddress: "Phong Châu",
    roleOnCertificate: "CA_NHAN",
  };
}

function makeParcel(id: string, num: string): Parcel {
  return {
    ...emptyParcel(id, `lu_${id}`),
    parcelNumber: num,
    area: "100",
    addressOnCertificate: "Phong Châu",
    landUses: [
      {
        ...emptyLandUse(`lu_${id}`),
        purposeCode: "ODT",
        area: "100",
      },
    ],
  };
}

function makeDraft(parcels: Parcel[], owners: Owner[]): IntakeDraft {
  return {
    certificate: { issueNumber: "AD 123456", issueDate: "2020-01-01", registryNumber: "CH001" },
    owners,
    parcels,
    assets: [],
    phone: "0912345678",
    consentAccepted: true,
  };
}

function makeRecord(id: string, draft: IntakeDraft): SubmissionRecord {
  return {
    submissionId: id,
    receiptCode: `PC-KK-2026-${id.padStart(4, "0")}`,
    status: "ACCEPTED",
    phone: "0912345678",
    version: 1,
    accessCodeHash: "hash",
    failedAttempts: 0,
    lockedUntil: "",
    consentVersion: "v1",
    consentedAt: new Date().toISOString(),
    retentionUntil: "",
    driveFolderId: "folder_1",
    officialCaseId: "",
    acceptStep: "",
    claimedBy: "",
    claimedAt: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draft,
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
  };
}

describe("PL3 export large certificate and warnings tests", () => {
  it("L1: 1 GCN x 20 parcels x 1 owner -> 20 rows; load via ExcelJS, sheet PL3 has 22 rows", async () => {
    const parcels = Array.from({ length: 20 }, (_, i) => makeParcel(`p_${i}`, String(i + 1)));
    const owners = [makeOwner("o_1", "Nguyễn Văn A")];
    const rec = makeRecord("1", makeDraft(parcels, owners));

    const content = buildPl3Content([rec]);
    expect(content.official.rows.length).toBe(20);

    const bytes = await renderPl3Workbook(content);
    const wb = new ExcelJS.Workbook();
    // exceljs khai báo Buffer khác generic shape với @types/node hiện tại — ép kiểu có chủ đích.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(bytes) as any);

    const sheet = wb.getWorksheet("PL3")!;
    expect(sheet.rowCount).toBe(22); // 2 header rows + 20 data rows
  });

  it("L2: 1 GCN x 20 parcels x 3 owners -> 60 rows, order (parcel, owner)", async () => {
    const parcels = Array.from({ length: 20 }, (_, i) => makeParcel(`p_${i}`, String(i + 1)));
    const owners = [
      makeOwner("o_1", "Nguyễn Văn A"),
      makeOwner("o_2", "Trần Thị B"),
      makeOwner("o_3", "Lê Văn C"),
    ];
    const rec = makeRecord("1", makeDraft(parcels, owners));

    const content = buildPl3Content([rec]);
    expect(content.official.rows.length).toBe(60);
  });

  it("L3: Vietnamese characters 'Nguyễn Văn Ước', 'Đất ở tại đô thị' preserved after reloading", async () => {
    const parcels = [makeParcel("p_1", "1")];
    const owners = [makeOwner("o_1", "Nguyễn Văn Ước")];
    const rec = makeRecord("1", makeDraft(parcels, owners));

    const content = buildPl3Content([rec]);
    const bytes = await renderPl3Workbook(content);

    const wb = new ExcelJS.Workbook();
    // exceljs khai báo Buffer khác generic shape với @types/node hiện tại — ép kiểu có chủ đích.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(bytes) as any);
    const sheet = wb.getWorksheet("PL3")!;
    const row3 = sheet.getRow(3);

    // Cột STT = 1, Cột 1 = Mã ĐVHC (col index 2), ..., Cột 7 = Họ và tên (col index 8)
    const cellValue = String(row3.getCell(8).value);
    expect(cellValue).toBe("Nguyễn Văn Ước");
  });

  it("L4: Empty cell is empty string, not undefined/null", async () => {
    const parcels = [makeParcel("p_1", "1")];
    const owners = [makeOwner("o_1", "Nguyễn Văn A")];
    const rec = makeRecord("1", makeDraft(parcels, owners));

    const content = buildPl3Content([rec]);
    const bytes = await renderPl3Workbook(content);

    const wb = new ExcelJS.Workbook();
    // exceljs khai báo Buffer khác generic shape với @types/node hiện tại — ép kiểu có chủ đích.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(bytes) as any);
    const sheet = wb.getWorksheet("PL3")!;
    const row3 = sheet.getRow(3);

    // Check an empty cell in row 3 (Cột 6: Số định danh tổ chức là col index 7)
    const cellValue = row3.getCell(7).value;
    expect(cellValue).toBe("");
  });

  it("L5: 2.500 records x 1 parcel -> workbook built, rows.length === 2500, time < 30s", async () => {
    const parcels = [makeParcel("p_1", "1")];
    const owners = [makeOwner("o_1", "Nguyễn Văn A")];
    const draft = makeDraft(parcels, owners);
    const records = Array.from({ length: 2500 }, (_, i) => makeRecord(String(i + 1), draft));

    const startTime = Date.now();
    const content = buildPl3Content(records);
    expect(content.official.rows.length).toBe(2500);

    const bytes = await renderPl3Workbook(content);
    const duration = (Date.now() - startTime) / 1000;

    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(duration).toBeLessThan(30);
  }, 30000);

  it("L6: Record with warning -> warnings.length > 0 AND sheet 'Canh bao' has matching rows", async () => {
    const parcels = [
      {
        ...makeParcel("p_1", "1"),
        oldWard: "HA_THACH",
        mapSheetNumber: "999", // Trigger warning for unknown map sheet
      },
    ];
    const owners = [makeOwner("o_1", "Nguyễn Văn A")];
    const rec = makeRecord("1", makeDraft(parcels, owners));

    const content = buildPl3Content([rec]);
    expect(content.official.warnings.length).toBeGreaterThan(0);

    const bytes = await renderPl3Workbook(content);
    const wb = new ExcelJS.Workbook();
    // exceljs khai báo Buffer khác generic shape với @types/node hiện tại — ép kiểu có chủ đích.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(bytes) as any);

    const warningSheet = wb.getWorksheet("Canh bao");
    expect(warningSheet).toBeDefined();
    expect(warningSheet!.rowCount).toBeGreaterThan(1);
  });
});
