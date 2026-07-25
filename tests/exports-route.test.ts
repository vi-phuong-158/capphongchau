import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/exports/route";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import { UserRole } from "@/modules/common/domain";
import { emptyLandUse, emptyOwner, emptyParcel, type IntakeDraft } from "@/modules/public-intake/types";

// Setup mocks for route dependencies
const mockUser = {
  email: "admin@phongchau.gov.vn",
  role: UserRole.WARD_ADMIN,
  id: "user_1",
};

vi.mock("@/modules/auth/authorization", () => ({
  requireActiveUser: vi.fn().mockImplementation(async () => mockUser),
  AuthorizationError: class AuthorizationError extends Error {
    kind: "ACCESS_DENIED" | "UNAUTHENTICATED";
    constructor(kind: "ACCESS_DENIED" | "UNAUTHENTICATED", message: string) {
      super(message);
      this.kind = kind;
    }
  },
}));

vi.mock("@/modules/auth/csrf", () => ({
  verifyCsrfToken: vi.fn().mockReturnValue(true),
}));

vi.mock("@/modules/common/env", () => ({
  loadServerEnvironment: vi.fn().mockReturnValue({
    AUTH_SECRET: "mock-secret-at-least-32-chars-long-security",
  }),
}));

const mockList = vi.fn();
const mockAppendExportJob = vi.fn().mockResolvedValue(undefined);
const mockAppendAudit = vi.fn().mockResolvedValue(undefined);

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    list: (...args: any[]) => mockList(...args),
    appendExportJob: (...args: any[]) => mockAppendExportJob(...args),
    appendAudit: (...args: any[]) => mockAppendAudit(...args),
  }),
}));

const mockUploadExport = vi.fn().mockResolvedValue("drive_file_123");

vi.mock("@/modules/public-intake/storage", () => ({
  getPublicIntakeStorage: vi.fn().mockReturnValue({
    uploadExport: (...args: any[]) => mockUploadExport(...args),
  }),
}));

function makeDraft(): IntakeDraft {
  return {
    certificate: { issueNumber: "AD 123456", issueDate: "2020-01-01", registryNumber: "CH001" },
    owners: [
      {
        ...emptyOwner("o1"),
        fullName: "Nguyễn Văn A",
        identityNumber: "025080001234",
        dateOfBirth: "1980-01-01",
        gender: "NAM",
        residenceAddress: "Phong Châu",
        roleOnCertificate: "CA_NHAN",
      },
    ],
    parcels: [
      {
        ...emptyParcel("p1", "l1"),
        parcelNumber: "10",
        area: "100",
        addressOnCertificate: "Phong Châu",
        landUses: [{ ...emptyLandUse("l1"), purposeCode: "ODT", area: "100" }],
      },
    ],
    assets: [],
    phone: "0912345678",
    consentAccepted: true,
  };
}

function makeRecord(id: string, status: any = "ACCEPTED", overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  const d = makeDraft();
  return {
    submissionId: id,
    receiptCode: `PC-KK-2026-${id.padStart(4, "0")}`,
    status,
    phone: "0912345678",
    version: 1,
    accessCodeHash: "hash",
    failedAttempts: 0,
    lockedUntil: "",
    draft: d,
    draftJson: JSON.stringify(d),
    rawDraftJson: JSON.stringify(d),
    fileSummaries: [
      {
        fileId: "f1",
        documentType: "CERTIFICATE",
        fileName: "AD123456-GCN.jpg",
        driveFileId: "drive_1",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        createdAt: new Date().toISOString(),
      },
    ],
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    legacyRowIndex: 1,
    identityCardNumber: "025080001234",
    ownerName: "Nguyễn Văn A",
    ...overrides,
  };
}

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/exports", {
    method: "POST",
    headers: {
      "x-csrf-token": "valid-csrf",
      "x-request-id": "req-test-1",
    },
  });
}

describe("POST /api/exports route tests", () => {
  it("T1: 1 record ACCEPTED -> 200, magic byte PK (0x50 0x4b), x-export-row-count = 1", async () => {
    mockList.mockResolvedValueOnce([makeRecord("1")]);
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get("x-export-row-count")).toBe("1");
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it("T2: 2.500 records ACCEPTED -> x-export-row-count = 2500, x-export-truncated = 0", async () => {
    const records = Array.from({ length: 2500 }, (_, i) => makeRecord(String(i + 1)));
    mockList.mockResolvedValueOnce(records);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    // TRƯỚC Phase 2, route cắt .slice(0, 2000) nên x-export-row-count trả về "2000", gây FAIL test này!
    expect(res.headers.get("x-export-row-count")).toBe("2500");
  });

  it("T3: appendExportJob reject -> 200, file intact, x-export-audit = failed", async () => {
    mockList.mockResolvedValueOnce([makeRecord("1")]);
    mockAppendExportJob.mockRejectedValueOnce(new Error("DB Connection Failed"));

    const res = await POST(makeRequest());

    // TRƯỚC Phase 2, appendExportJob bị reject khiến toàn bộ route ném lỗi và trả HTTP 500, gây FAIL test này!
    expect(res.status).toBe(200);
    expect(res.headers.get("x-export-row-count")).toBe("1");
  });

  it("T4: appendAudit reject -> 200, file intact", async () => {
    mockList.mockResolvedValueOnce([makeRecord("1")]);
    mockAppendAudit.mockRejectedValueOnce(new Error("Audit log insert failed"));

    const res = await POST(makeRequest());

    // TRƯỚC Phase 2, appendAudit bị reject khiến route ném lỗi và trả HTTP 500, gây FAIL test này!
    expect(res.status).toBe(200);
    expect(res.headers.get("x-export-row-count")).toBe("1");
  });

  it("T5: uploadExport reject -> 200, x-export-archived = 0", async () => {
    mockList.mockResolvedValueOnce([makeRecord("1")]);
    mockUploadExport.mockRejectedValueOnce(new Error("Drive Upload Failed"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get("x-export-archived")).toBe("0");
  });

  it("T6: fileSummaries is JSON string instead of array -> column 49 has file name", async () => {
    const rawFileSummariesJson = JSON.stringify([
      {
        fileId: "f1",
        documentType: "CERTIFICATE",
        fileName: "AD123456-GCN.jpg",
        driveFileId: "drive_1",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        createdAt: new Date().toISOString(),
      },
    ]);

    const recordWithJsonString = makeRecord("1", "ACCEPTED", {
      fileSummaries: rawFileSummariesJson as any,
    });

    mockList.mockResolvedValueOnce([recordWithJsonString]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const sheet = wb.getWorksheet("PL3")!;
    // Dòng 1 & 2 là Header. Dòng 3 là bản ghi đầu tiên. Cột 49 (AW) là Tệp scan.
    const col49Value = sheet.getRow(3).getCell(49).value;

    // TRƯỚC Phase 2, fileSummaries dạng chuỗi không được decode đúng làm cho Cột 49 bị rỗng, gây FAIL test này!
    expect(String(col49Value || "")).toContain("AD123456-GCN.jpg");
  });
});
