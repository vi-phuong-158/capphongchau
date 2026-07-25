import { describe, expect, it } from "vitest";
import { completionChecks } from "@/modules/submissions/completion-checks";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import {
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  type IntakeDraft,
} from "@/modules/public-intake/types";

function makeDraft(overrides: Partial<IntakeDraft> = {}): IntakeDraft {
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
        mapSheetNumber: "5",
        area: "100",
        addressOnCertificate: "Phong Châu",
        landUses: [{ ...emptyLandUse("l1"), purposeCode: "ODT", area: "100" }],
      },
    ],
    assets: [],
    phone: "0912345678",
    consentAccepted: true,
    ...overrides,
  };
}

function makeRecord(): SubmissionRecord {
  return {
    submissionId: "sub_1",
    receiptCode: "PC-KK-2026-0001",
    status: "UNDER_REVIEW",
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
    claimedBy: "officer@phongchau.gov.vn",
    claimedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draft: makeDraft(),
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
  };
}

describe("Completion checks validation rules", () => {
  it("CC1: valid draft -> zero BLOCKING issues", () => {
    const rec = makeRecord();
    const checks = completionChecks(rec, makeDraft());
    const blocking = checks.filter((c) => c.severity === "BLOCKING");
    expect(blocking.length).toBe(0);
  });

  it("CC2: missing issue number -> BLOCKING issue CERT_ISSUE_NUMBER_MISSING", () => {
    const rec = makeRecord();
    const draft = makeDraft({
      certificate: { issueNumber: "", issueDate: "2020-01-01", registryNumber: "CH001" },
    });
    const checks = completionChecks(rec, draft);
    expect(checks.some((c) => c.code === "CERT_ISSUE_NUMBER_MISSING")).toBe(true);
  });

  it("CC3: invalid citizen ID -> BLOCKING issue OWNER_0_ID_INVALID", () => {
    const rec = makeRecord();
    const draft = makeDraft({
      owners: [
        {
          ...emptyOwner("o1"),
          fullName: "Nguyễn Văn A",
          identityNumber: "1234", // invalid
          ownerType: "CA_NHAN",
        },
      ],
    });
    const checks = completionChecks(rec, draft);
    expect(checks.some((c) => c.code === "OWNER_0_ID_INVALID")).toBe(true);
  });

  it("CC4: 4 land uses on 1 parcel -> BLOCKING issue PARCEL_0_LAND_USES_EXCEEDED", () => {
    const rec = makeRecord();
    const draft = makeDraft({
      parcels: [
        {
          ...emptyParcel("p1", "l1"),
          parcelNumber: "10",
          area: "100",
          landUses: [
            emptyLandUse("l1"),
            emptyLandUse("l2"),
            emptyLandUse("l3"),
            emptyLandUse("l4"),
          ],
        },
      ],
    });
    const checks = completionChecks(rec, draft);
    expect(checks.some((c) => c.code === "PARCEL_0_LAND_USES_EXCEEDED")).toBe(true);
  });
});
