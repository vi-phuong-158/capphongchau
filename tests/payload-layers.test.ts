import { describe, expect, it } from "vitest";
import { effectivePayload, payloadLayerOf } from "@/modules/public-intake/payload-layers";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import {
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  type IntakeDraft,
} from "@/modules/public-intake/types";

function makeDraft(name: string): IntakeDraft {
  return {
    certificate: { issueNumber: "AD 123456", issueDate: "2020-01-01", registryNumber: "CH001" },
    owners: [
      {
        ...emptyOwner("o1"),
        fullName: name,
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

function makeRecord(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  const d = makeDraft("Nguyen Van Draft");
  return {
    submissionId: "sub_1",
    receiptCode: "PC-KK-2026-0001",
    status: "SUBMITTED",
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
    claimedAt: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draft: d,
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
    ...overrides,
  };
}

describe("Payload layers module tests", () => {
  it("P1: only draft present -> layer is DRAFT", () => {
    const rec = makeRecord();
    expect(payloadLayerOf(rec)).toBe("DRAFT");
    expect(effectivePayload(rec)?.owners[0].fullName).toBe("Nguyen Van Draft");
  });

  it("P2: citizen payload present -> layer is CITIZEN", () => {
    const rec = makeRecord({ citizenPayload: makeDraft("Nguyen Van Citizen") });
    expect(payloadLayerOf(rec)).toBe("CITIZEN");
    expect(effectivePayload(rec)?.owners[0].fullName).toBe("Nguyen Van Citizen");
  });

  it("P3: working payload present -> layer is WORKING", () => {
    const rec = makeRecord({
      citizenPayload: makeDraft("Nguyen Van Citizen"),
      workingPayload: makeDraft("Nguyen Van Working"),
    });
    expect(payloadLayerOf(rec)).toBe("WORKING");
    expect(effectivePayload(rec)?.owners[0].fullName).toBe("Nguyen Van Working");
  });

  it("P4: official payload present -> layer is OFFICIAL", () => {
    const rec = makeRecord({
      citizenPayload: makeDraft("Nguyen Van Citizen"),
      workingPayload: makeDraft("Nguyen Van Working"),
      officialPayload: makeDraft("Nguyen Van Official"),
    });
    expect(payloadLayerOf(rec)).toBe("OFFICIAL");
    expect(effectivePayload(rec)?.owners[0].fullName).toBe("Nguyen Van Official");
  });
});
