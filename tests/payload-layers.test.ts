import { describe, expect, it } from "vitest";
import { effectivePayload, payloadLayerOf } from "@/modules/public-intake/payload-layers";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import { emptyLandUse, emptyOwner, emptyParcel, type IntakeDraft } from "@/modules/public-intake/types";

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
    claimedAt: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draft: d,
    citizenPayload: null,
    citizenPayloadVersion: 0,
    citizenPayloadAt: "",
    workingPayload: null,
    workingPayloadAt: "",
    workingPayloadBy: "",
    accessVersion: 1,
    fileSummaries: [],
    rowIndex: 1,
    ...overrides,
  };
}

describe("Payload layers unit tests", () => {
  it("P1: only draft exists -> effectivePayload returns draft, layer is DRAFT", () => {
    const rec = makeRecord();
    expect(effectivePayload(rec)?.owners[0].fullName).toBe("Nguyen Van Draft");
    expect(payloadLayerOf(rec)).toBe("DRAFT");
  });

  it("P2: citizenPayload exists -> effectivePayload returns citizenPayload, layer is CITIZEN", () => {
    const citizen = makeDraft("Nguyen Van Citizen");
    const rec = makeRecord({ citizenPayload: citizen, citizenPayloadVersion: 1 });
    expect(effectivePayload(rec)?.owners[0].fullName).toBe("Nguyen Van Citizen");
    expect(payloadLayerOf(rec)).toBe("CITIZEN");
  });

  it("P3: workingPayload exists -> effectivePayload returns workingPayload, layer is WORKING", () => {
    const citizen = makeDraft("Nguyen Van Citizen");
    const working = makeDraft("Nguyen Van Working");
    const rec = makeRecord({ citizenPayload: citizen, workingPayload: working });
    expect(effectivePayload(rec)?.owners[0].fullName).toBe("Nguyen Van Working");
    expect(payloadLayerOf(rec)).toBe("WORKING");
  });

  it("P4: no payloads exist -> effectivePayload returns null", () => {
    const rec = makeRecord({ draft: null, citizenPayload: null, workingPayload: null });
    expect(effectivePayload(rec)).toBeNull();
    expect(payloadLayerOf(rec)).toBe("DRAFT");
  });
});
