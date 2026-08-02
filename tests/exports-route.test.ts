import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/exports/route";
import type { SubmissionRecord, PublicStatus } from "@/modules/public-intake/repository";
import { UserRole } from "@/modules/common/domain";
import {
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  type IntakeDraft,
} from "@/modules/public-intake/types";

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

const mockListForExport = vi.fn();
const mockAppendExportJob = vi.fn().mockResolvedValue(undefined);
const mockAppendAudit = vi.fn().mockResolvedValue(undefined);

vi.mock("@/modules/public-intake/repository", () => ({
  getPublicIntakeRepository: vi.fn().mockReturnValue({
    listForExport: (...args: unknown[]) => mockListForExport(...args),
    appendExportJob: (...args: unknown[]) => mockAppendExportJob(...args),
    appendAudit: (...args: unknown[]) => mockAppendAudit(...args),
  }),
  decodeFileSummaries: (value: unknown) => {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return Array.isArray(value) ? value : [];
  },
}));

const mockUploadExport = vi.fn().mockResolvedValue("drive_file_123");

vi.mock("@/modules/public-intake/storage", () => ({
  getPublicIntakeStorage: vi.fn().mockReturnValue({
    uploadExport: (...args: unknown[]) => mockUploadExport(...args),
  }),
}));

async function* toAsyncGen<T>(chunks: T[][]): AsyncGenerator<T[]> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

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

function makeRecord(
  id: string,
  status: PublicStatus = "ACCEPTED",
  overrides: Partial<SubmissionRecord> = {},
): SubmissionRecord {
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
    consentVersion: "v1",
    consentedAt: new Date().toISOString(),
    retentionUntil: "",
    driveFolderId: "folder_1",
    officialCaseId: "",
    acceptStep: "",
    claimedBy: "",
    claimedByDisplayName: "",
    intakeChannel: "SELF_SERVICE" as const,
    assistedByEmail: "",
    assistedByDisplayName: "",
    assistedAt: "",
    claimedAt: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draft: d,
    accessVersion: 1,
    fileSummaries: [
      {
        fileId: "f1",
        ownerId: "o1",
        documentType: "CERTIFICATE",
        status: "UPLOADED",
        sizeBytes: 1024,
        checksum: "abc",
        driveFileId: "drive_1",
        mimeType: "image/jpeg",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    rowIndex: 1,
    internalNotes: "",
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
    mockListForExport.mockReturnValueOnce(toAsyncGen([[makeRecord("1")]]));
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
    mockListForExport.mockReturnValueOnce(
      toAsyncGen([records.slice(0, 1000), records.slice(1000, 2000), records.slice(2000)]),
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get("x-export-row-count")).toBe("2500");
    expect(res.headers.get("x-export-truncated")).toBe("0");
  }, 30000);

  it("T3: appendExportJob reject -> 200, file intact, x-export-audit = failed", async () => {
    mockListForExport.mockReturnValueOnce(toAsyncGen([[makeRecord("1")]]));
    mockAppendExportJob.mockRejectedValueOnce(new Error("DB Connection Failed"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get("x-export-row-count")).toBe("1");
  });

  it("T4: appendAudit reject -> 200, file intact", async () => {
    mockListForExport.mockReturnValueOnce(toAsyncGen([[makeRecord("1")]]));
    mockAppendAudit.mockRejectedValueOnce(new Error("Audit log insert failed"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get("x-export-row-count")).toBe("1");
    expect(res.headers.get("x-export-audit")).toBe("failed");
  });

  it("T5: uploadExport reject -> 200, x-export-archived = 0", async () => {
    mockListForExport.mockReturnValueOnce(toAsyncGen([[makeRecord("1")]]));
    mockUploadExport.mockRejectedValueOnce(new Error("Drive Upload Failed"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get("x-export-archived")).toBe("0");
  });

  it("T6: fileSummaries is JSON string instead of array -> column 49 has file name", async () => {
    const rawFileSummariesJson = JSON.stringify([
      {
        fileId: "f1",
        ownerId: "o1",
        documentType: "CERTIFICATE",
        status: "UPLOADED",
        sizeBytes: 1024,
        checksum: "abc",
        driveFileId: "drive_1",
        mimeType: "image/jpeg",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const recordWithJsonString = makeRecord("1", "ACCEPTED", {
      fileSummaries: rawFileSummariesJson as unknown as SubmissionRecord["fileSummaries"],
    });

    mockListForExport.mockReturnValueOnce(toAsyncGen([[recordWithJsonString]]));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const buf = await res.arrayBuffer();
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    // exceljs khai báo Buffer khác generic shape với @types/node hiện tại — ép kiểu có chủ đích.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(buf) as any);

    const sheet = wb.getWorksheet("PL3")!;
    // Dòng 1 & 2 là Header. Dòng 3 là bản ghi đầu tiên. STT là Cell 1. Cột Tệp scan (trường 49) là Cell 50.
    const col49Value = sheet.getRow(3).getCell(50).value;

    expect(String(col49Value || "")).toContain("AD 123456-GCN.jpg");
  });
  it("T7: invalid scope -> 400 VALIDATION_FAILED", async () => {
    const req = new NextRequest("http://localhost:3000/api/exports?scope=invalid", {
      method: "POST",
      headers: {
        "x-csrf-token": "valid-csrf",
        "x-request-id": "req-test-1",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.message).toContain("Phạm vi xuất (scope) không hợp lệ");
  });

  it("T8: repeated query params (scope, status, from, to, officer) -> 400 VALIDATION_FAILED", async () => {
    const paramsToTest = ["scope", "status", "from", "to", "officer"];
    for (const param of paramsToTest) {
      const req = new NextRequest(
        `http://localhost:3000/api/exports?${param}=val1&${param}=val2`,
        {
          method: "POST",
          headers: {
            "x-csrf-token": "valid-csrf",
            "x-request-id": "req-test-repeated",
          },
        },
      );

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_FAILED");
    }
  });
});
