import { describe, expect, it } from "vitest";

import {
  applyGcnV2BackendComparisons,
  buildGcnV2BackendComparisons,
  buildGcnV2LeafSuggestions,
} from "@/modules/ai-extraction/gcn-v2-application-backend";
import {
  collectGcnV2FieldObservations,
  gcnExtractionPayloadV2Schema,
} from "@/modules/ai-extraction/gcn-v2-schema";
import { buildSubmissionRows, PL3_DATA_COLUMN_COUNT } from "@/modules/public-intake/pl3-export";
import type { SubmissionRecord } from "@/modules/public-intake/repository";
import { emptyDraft, type IntakeDraft } from "@/modules/public-intake/types";
import type { PublicFileSummary } from "@/modules/public-intake/workflow";
import { completionChecks } from "@/modules/submissions/completion-checks";
import { buildSyntheticGcnV2Payload } from "./fixtures/gcn-v2-synthetic";

function completeSyntheticPayload() {
  const payload = buildSyntheticGcnV2Payload();
  payload.data.owners[1] = {
    ...payload.data.owners[1],
    ownerType: "DONG_SU_DUNG",
    organisationName: null,
    organisationIdentityNumber: null,
    fullName: "LE THI B",
    dateOfBirth: "1982-02-02",
    gender: "NU",
    roleOnCertificate: "THANH_VIEN",
  };
  payload.data.parcels[15].oldWard = "PHU_HO";
  payload.data.parcels[17].parcelNumber = "018";
  payload.quality = { documentType: "CERTIFICATE", imageStatus: "CLEAR", note: "" };
  payload.pages = [
    {
      fileId: "gcn-file-e2e",
      pageNumber: 1,
      pageType: "SUPPLEMENT",
      rotationDegrees: 0,
      imageStatus: "CLEAR",
      ownerStableKeys: payload.data.owners.map((owner) => owner.stableKey),
      parcelStableKeys: payload.data.parcels.map((parcel) => parcel.stableKey),
      registeredChangeStableKeys: payload.data.registeredChanges.map((change) => change.stableKey),
      warnings: [],
    },
  ];
  payload.evidence = collectGcnV2FieldObservations(payload).map((observation) => ({
    fieldPath: observation.fieldPath,
    rawText: observation.value,
    fileId: "gcn-file-e2e",
    pageNumber: 1,
    confidence: observation.value === null ? null : 0.99,
    status: observation.value === null ? "NOT_FOUND" : "EXTRACTED",
  }));
  payload.metadata.pagesProcessed = 1;
  payload.metadata.sourceDocumentHash = "e".repeat(64);
  payload.warnings = [];
  return gcnExtractionPayloadV2Schema.parse(payload);
}

function uploadedFiles(draft: IntakeDraft): PublicFileSummary[] {
  const common = {
    status: "UPLOADED" as const,
    sizeBytes: 1_024,
    checksum: "synthetic-e2e-checksum",
    mimeType: "image/jpeg",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
  return [
    {
      ...common,
      fileId: "gcn-file-e2e",
      ownerId: "",
      documentType: "CERTIFICATE" as const,
    },
    ...draft.owners.flatMap((owner, index) => [
      {
        ...common,
        fileId: `identity-front-${index}`,
        ownerId: owner.id,
        documentType: "CITIZEN_ID_FRONT" as const,
      },
      {
        ...common,
        fileId: `identity-back-${index}`,
        ownerId: owner.id,
        documentType: "CITIZEN_ID_BACK" as const,
      },
    ]),
  ];
}

function record(draft: IntakeDraft): SubmissionRecord {
  return {
    submissionId: "submission_gcn_v2_e2e",
    receiptCode: "PC-E2E-000001",
    status: "UNDER_REVIEW",
    phone: "0900000000",
    version: 2,
    accessCodeHash: "synthetic-hash",
    failedAttempts: 0,
    lockedUntil: "",
    consentVersion: "synthetic-v1",
    consentedAt: "2026-08-03T00:00:00.000Z",
    retentionUntil: "",
    driveFolderId: "synthetic-folder",
    officialCaseId: "",
    acceptStep: "",
    claimedBy: "officer@example.invalid",
    claimedByDisplayName: "Synthetic Officer",
    intakeChannel: "SELF_SERVICE",
    assistedByEmail: "",
    assistedByDisplayName: "",
    assistedAt: "",
    claimedAt: "2026-08-03T00:00:00.000Z",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    draft,
    citizenPayload: null,
    citizenPayloadVersion: 1,
    citizenPayloadAt: "2026-08-03T00:00:00.000Z",
    workingPayload: draft,
    workingPayloadAt: "2026-08-03T00:00:00.000Z",
    workingPayloadBy: "officer@example.invalid",
    officialPayload: null,
    officialPayloadAt: "",
    officialPayloadBy: "",
    accessVersion: 1,
    fileSummaries: uploadedFiles(draft),
    rowIndex: 1,
    internalNotes: "",
  };
}

describe("GCN v2 synthetic end-to-end", () => {
  it("maps validated AI output into the officer payload, completion checks and 49-column PL3", () => {
    const payload = completeSyntheticPayload();
    const current = emptyDraft("owner-empty", "parcel-empty", "landuse-empty");
    current.phone = "0900000000";
    current.consentAccepted = true;
    const comparisons = buildGcnV2BackendComparisons({
      current,
      citizen: structuredClone(current),
      payload,
      suggestions: buildGcnV2LeafSuggestions(payload),
    });
    const applied = applyGcnV2BackendComparisons({ draft: current, comparisons });

    expect(applied.invalidFieldPaths).toEqual([]);
    expect(applied.draft.owners).toHaveLength(2);
    expect(applied.draft.parcels).toHaveLength(18);
    expect(applied.draft.parcels.every((parcel) => parcel.landUses.length === 3)).toBe(true);
    expect(applied.draft.assets).toHaveLength(1);
    applied.draft.owners.forEach((owner, index) => {
      owner.identityNumber = String(index + 1).padStart(12, "0");
      owner.identityStatus = "MANUAL_COMPLETE";
    });

    const submission = record(applied.draft);
    expect(
      completionChecks(submission, applied.draft).filter((check) => check.severity === "BLOCKING"),
    ).toEqual([]);
    const exported = buildSubmissionRows(submission);
    expect(exported.rows).toHaveLength(36);
    expect(exported.rows.every((row) => row.length === PL3_DATA_COLUMN_COUNT)).toBe(true);
    expect(exported.rows[0][18]).toBe("01");
    expect(exported.rows[0][19]).toBe("001");
  });
});
