import { describe, expect, it } from "vitest";

import {
  applyGcnV2BackendComparisons,
  buildGcnV2BackendComparisons,
  buildGcnV2LeafSuggestions,
  hydrateGcnV2ApplicationDraft,
  validateGcnV2RuntimeMetadata,
  type GcnV2LeafSuggestion,
} from "@/modules/ai-extraction/gcn-v2-application-backend";
import type { GcnExtractionPayloadV2 } from "@/modules/ai-extraction/gcn-v2-contract";
import { emptyDraft } from "@/modules/public-intake/types";
import { draftSchema } from "@/modules/public-intake/validation";

function payload(): GcnExtractionPayloadV2 {
  return {
    quality: { documentType: "CERTIFICATE", imageStatus: "CLEAR", note: "" },
    data: {
      certificate: {
        issueNumber: "CS 123",
        issueDate: "2026-08-03",
        registryNumber: "CH 456",
      },
      owners: [
        {
          stableKey: "owner-a",
          ownerType: "CA_NHAN",
          organisationName: null,
          organisationIdentityNumber: null,
          fullName: "Nguyễn Văn A",
          dateOfBirth: null,
          gender: null,
          residenceAddress: "Phường Phong Châu",
          roleOnCertificate: "CHU_SU_DUNG",
        },
      ],
      parcels: [
        {
          stableKey: "parcel-a",
          parcelIdCode: null,
          mapSheetNumber: "05",
          parcelNumber: "012",
          addressOnCertificate: "Phường Phong Châu",
          oldWard: "PHU_HO",
          area: "120.5",
          landUses: [
            {
              stableKey: "land-a",
              purposeCode: "ODT",
              purposeFreeText: null,
              area: "120.5",
              originCode: "CONG_NHAN_QSDD",
              formCode: "SU_DUNG_RIENG",
              termCode: "LAU_DAI",
            },
          ],
        },
      ],
      assets: [],
      registeredChanges: [],
    },
    pages: [
      {
        fileId: "file-gcn-1",
        pageNumber: 1,
        pageType: "OWNER_AND_PARCEL",
        rotationDegrees: 0,
        imageStatus: "CLEAR",
        ownerStableKeys: ["owner-a"],
        parcelStableKeys: ["parcel-a"],
        registeredChangeStableKeys: [],
        warnings: [],
      },
    ],
    evidence: [],
    metadata: {
      schemaVersion: "gcn-v2.0",
      promptVersion: "gcn-v2.0",
      modelIdentifier: "test-model",
      pagesProcessed: 1,
      sourceDocumentHash: "a".repeat(64),
      processedAt: "2026-08-03T08:00:00.000Z",
    },
    warnings: [],
  };
}

function suggestion(
  templatePath: string,
  destinationPath: string,
  value: string,
  status: "EXTRACTED" | "LOW_CONFIDENCE" | "UNREADABLE" = "EXTRACTED",
): GcnV2LeafSuggestion {
  return {
    templatePath,
    destinationPath,
    value,
    sourceValue: value,
    fieldStatus:
      status === "EXTRACTED" ? "CLEAR" : status === "LOW_CONFIDENCE" ? "CHECK" : "MANUAL_REQUIRED",
    evidence: {
      fieldPath: destinationPath,
      rawText: value,
      fileId: "file-gcn-1",
      pageNumber: 1,
      confidence: status === "EXTRACTED" ? 0.99 : 0.4,
      status,
    },
  };
}

describe("GCN v2 backend comparison and safe application", () => {
  it("hydrates a pre-full-PL3 stored draft without losing legacy organisation values", () => {
    const legacy = {
      certificate: { issueNumber: "CS 1", issueDate: "", registryNumber: "" },
      owners: [
        {
          id: "owner-old",
          ownerType: "TO_CHUC",
          fullName: "Tổ chức cũ",
          identityNumber: "0123456789",
          dateOfBirth: "",
          gender: "",
          residenceAddress: "Phong Châu",
          identitySource: "",
          qrPayloadHash: "",
          qrDecoderVersion: "",
          qrParserVersion: "",
          identityStatus: "",
          identityConfirmedAt: "",
          roleOnCertificate: "TO_CHUC",
          hasDistinctCurrentUser: false,
          currentUserName: "",
          currentUserCitizenId: "",
          currentUserAddress: "",
          changeReason: "",
        },
      ],
      parcels: [],
      phone: "",
      consentAccepted: true,
    };
    const hydrated = hydrateGcnV2ApplicationDraft(legacy);

    expect(hydrated).not.toBeNull();
    expect(hydrated?.assets).toEqual([]);
    expect(hydrated?.owners[0]).toMatchObject({
      organisationName: "Tổ chức cũ",
      organisationIdentityNumber: "0123456789",
      fullName: "",
      identityNumber: "",
      identityOverrideReason: "",
    });
    expect(draftSchema.safeParse(hydrated).success).toBe(true);
  });

  it("fails closed when runtime metadata does not match the trusted job and manifest", () => {
    const input = payload();
    input.metadata.sourceDocumentHash = "b".repeat(64);
    input.pages[0].fileId = "foreign-file";
    expect(
      validateGcnV2RuntimeMetadata({
        payload: input,
        expectedSchemaVersion: "gcn-v2.0",
        expectedPromptVersion: "gcn-v2.0",
        expectedModelIdentifier: "test-model",
        expectedSourceHash: "a".repeat(64),
        allowedFileIds: new Set(["file-gcn-1"]),
      }),
    ).toEqual(expect.arrayContaining(["SOURCE_HASH_MISMATCH", "PAGE_FILE_NOT_IN_MANIFEST"]));
  });

  it("maps stable owner/parcel/land-use keys into existing blank rows and applies selected fields", () => {
    const current = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    const comparisons = buildGcnV2BackendComparisons({
      current,
      citizen: structuredClone(current),
      payload: payload(),
      suggestions: [
        suggestion("owners[].ownerType", "owners[owner-a].ownerType", "CA_NHAN"),
        suggestion("owners[].fullName", "owners[owner-a].fullName", "Nguyễn Văn A"),
        suggestion("parcels[].mapSheetNumber", "parcels[parcel-a].mapSheetNumber", "05"),
        suggestion(
          "parcels[].landUses[].purposeCode",
          "parcels[parcel-a].landUses[land-a].purposeCode",
          "ODT",
        ),
      ],
    });

    expect(comparisons.map((entry) => entry.fieldPath)).toEqual([
      "owners[owner-existing].ownerType",
      "owners[owner-existing].fullName",
      "parcels[parcel-existing].mapSheetNumber",
      "parcels[parcel-existing].landUses[land-existing].purposeCode",
    ]);
    expect(comparisons.every((entry) => entry.provenance === "EMPTY" && entry.applyable)).toBe(
      true,
    );

    const applied = applyGcnV2BackendComparisons({
      draft: current,
      comparisons,
      selectedFieldPaths: comparisons.map((entry) => entry.fieldPath),
    });
    expect(applied.invalidFieldPaths).toEqual([]);
    expect(applied.draft.owners[0].fullName).toBe("Nguyễn Văn A");
    expect(applied.draft.parcels[0].mapSheetNumber).toBe("05");
    expect(applied.draft.parcels[0].landUses[0].purposeCode).toBe("ODT");
  });

  it("treats the UI default owner type on a blank row as empty and applies organisation type atomically", () => {
    const current = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    const input = payload();
    input.data.owners[0] = {
      ...input.data.owners[0],
      ownerType: "TO_CHUC",
      organisationName: "CÔNG TY SYNTHETIC",
      fullName: null,
      roleOnCertificate: "TO_CHUC",
    };
    const comparisons = buildGcnV2BackendComparisons({
      current,
      citizen: structuredClone(current),
      payload: input,
      suggestions: [
        suggestion("owners[].ownerType", "owners[owner-a].ownerType", "TO_CHUC"),
        suggestion(
          "owners[].organisationName",
          "owners[owner-a].organisationName",
          "CÔNG TY SYNTHETIC",
        ),
      ],
    });
    const ownerType = comparisons.find((item) => item.templatePath === "owners[].ownerType");
    const organisation = comparisons.find(
      (item) => item.templatePath === "owners[].organisationName",
    );
    if (!ownerType || !organisation) throw new Error("Thiếu comparison chủ tổ chức.");

    expect(ownerType).toMatchObject({ currentValue: "", provenance: "EMPTY", applyable: true });
    expect(organisation).toMatchObject({ provenance: "EMPTY", applyable: true });

    const partial = applyGcnV2BackendComparisons({
      draft: current,
      comparisons,
      selectedFieldPaths: [organisation.fieldPath],
    });
    expect(partial.appliedFieldPaths).toEqual([]);
    expect(partial.invalidFieldPaths).toEqual([organisation.fieldPath]);
    expect(partial.draft.owners[0]).toMatchObject({ ownerType: "CA_NHAN", organisationName: "" });

    const applied = applyGcnV2BackendComparisons({
      draft: current,
      comparisons,
      selectedFieldPaths: [organisation.fieldPath, ownerType.fieldPath],
    });
    expect(applied.invalidFieldPaths).toEqual([]);
    expect(applied.draft.owners[0]).toMatchObject({
      ownerType: "TO_CHUC",
      organisationName: "CÔNG TY SYNTHETIC",
    });
  });

  it("never treats a citizen-selected non-default owner type as an empty UI placeholder", () => {
    const current = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    current.owners[0].ownerType = "TO_CHUC";
    const input = payload();
    const comparisons = buildGcnV2BackendComparisons({
      current,
      citizen: structuredClone(current),
      payload: input,
      suggestions: [suggestion("owners[].ownerType", "owners[owner-a].ownerType", "CA_NHAN")],
    });

    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]).toMatchObject({
      currentValue: "",
      provenance: "EMPTY",
      applyable: true,
    });
    expect(comparisons[0].fieldPath).not.toBe("owners[owner-existing].ownerType");

    const applied = applyGcnV2BackendComparisons({
      draft: current,
      comparisons,
      selectedFieldPaths: comparisons.map((item) => item.fieldPath),
    });
    expect(applied.draft.owners.find((item) => item.id === "owner-existing")?.ownerType).toBe(
      "TO_CHUC",
    );
  });

  it("turns canonical v2 evidence entries into an applyable UI comparison", () => {
    const current = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    const input = payload();
    input.evidence = [
      {
        fieldPath: "certificate.issueNumber",
        rawText: "CS 123",
        fileId: "file-gcn-1",
        pageNumber: 1,
        confidence: 0.98,
        status: "EXTRACTED",
      },
    ];
    const comparisons = buildGcnV2BackendComparisons({
      current,
      citizen: structuredClone(current),
      payload: input,
      suggestions: buildGcnV2LeafSuggestions(input),
    });
    const issueNumber = comparisons.find(
      (comparison) => comparison.fieldPath === "certificate.issueNumber",
    );

    expect(issueNumber).toMatchObject({
      applyable: true,
      provenance: "EMPTY",
      sourceValue: null,
      evidence: {
        rawText: "CS 123",
        pageNumber: 1,
        confidence: 0.98,
        status: "EXTRACTED",
      },
    });
  });

  it("uses the verified manifest ordinal instead of AI-controlled page order for source labels", () => {
    const input = payload();
    input.evidence = [
      {
        fieldPath: "certificate.issueNumber",
        rawText: "CS 123",
        fileId: "file-gcn-1",
        pageNumber: 2,
        confidence: 0.99,
        status: "EXTRACTED",
      },
    ];
    input.pages = [
      { ...input.pages[0], fileId: "file-gcn-2", pageNumber: 1 },
      { ...input.pages[0], fileId: "file-gcn-1", pageNumber: 2 },
    ];
    const suggestions = buildGcnV2LeafSuggestions(
      input,
      new Map([
        ["file-gcn-2", 1],
        ["file-gcn-1", 2],
      ]),
    );
    const issueNumber = suggestions.find(
      (item) => item.destinationPath === "certificate.issueNumber",
    );

    expect(issueNumber?.evidence).toMatchObject({
      fileId: "file-gcn-1",
      sourceImageOrdinal: 2,
    });
  });

  it("does not invent a conflict from two readable raw spans for one normalized value", () => {
    const current = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    const input = payload();
    input.evidence = [
      {
        fieldPath: "parcels[parcel-a].parcelNumber",
        rawText: "Số thửa: 012",
        fileId: "file-gcn-1",
        pageNumber: 1,
        confidence: 0.96,
        status: "EXTRACTED",
      },
      {
        fieldPath: "parcels[parcel-a].parcelNumber",
        rawText: "012",
        fileId: "file-gcn-1",
        pageNumber: 1,
        confidence: 0.99,
        status: "EXTRACTED",
      },
    ];
    const comparison = buildGcnV2BackendComparisons({
      current,
      citizen: structuredClone(current),
      payload: input,
      suggestions: buildGcnV2LeafSuggestions(input),
    }).find((entry) => entry.templatePath === "parcels[].parcelNumber");

    expect(comparison).toMatchObject({
      aiValue: "012",
      provenance: "EMPTY",
      applyable: true,
      evidence: { status: "EXTRACTED" },
    });
  });

  it("can apply an asset field alone by creating its server-verified parcel placeholder", () => {
    const current = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    current.parcels = [];
    const input = payload();
    input.data.assets = [
      {
        stableKey: "asset-alpha",
        parcelStableKey: "parcel-a",
        assetType: "NHA_O",
        description: "Nhà ở",
        mixedUseBuildingName: null,
        apartmentBuildingName: null,
        apartmentNumber: null,
        constructionArea: null,
        floorArea: null,
        ownershipForm: null,
        ownershipTerm: null,
        grade: null,
      },
    ];
    const comparisons = buildGcnV2BackendComparisons({
      current,
      citizen: structuredClone(current),
      payload: input,
      suggestions: [suggestion("assets[].assetType", "assets[asset-alpha].assetType", "NHA_O")],
    });
    const applied = applyGcnV2BackendComparisons({
      draft: current,
      comparisons,
      selectedFieldPaths: [comparisons[0].fieldPath],
    });

    expect(applied.invalidFieldPaths).toEqual([]);
    expect(applied.draft.parcels).toHaveLength(1);
    expect(applied.draft.assets[0]).toMatchObject({
      assetType: "NHA_O",
      parcelId: applied.draft.parcels[0].id,
    });
  });

  it("never collapses two AI assets onto the same current asset field path", () => {
    const current = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    current.assets = [
      {
        id: "asset-existing",
        parcelId: "parcel-existing",
        assetType: "NHA_O",
        description: "Nhà ở",
      },
    ];
    const input = payload();
    input.data.assets = ["asset-alpha", "asset-beta"].map((stableKey) => ({
      stableKey,
      parcelStableKey: "parcel-a",
      assetType: "NHA_O",
      description: "Nhà ở",
      mixedUseBuildingName: null,
      apartmentBuildingName: null,
      apartmentNumber: null,
      constructionArea: null,
      floorArea: null,
      ownershipForm: null,
      ownershipTerm: null,
      grade: null,
    }));
    const comparisons = buildGcnV2BackendComparisons({
      current,
      citizen: structuredClone(current),
      payload: input,
      suggestions: input.data.assets.map((asset) =>
        suggestion("assets[].assetType", `assets[${asset.stableKey}].assetType`, "NHA_O"),
      ),
    });

    expect(new Set(comparisons.map((comparison) => comparison.fieldPath)).size).toBe(2);
    expect(comparisons[0].fieldPath).toBe("assets[asset-existing].assetType");
    expect(comparisons[1].fieldPath).not.toBe(comparisons[0].fieldPath);
  });

  it("keeps a fourth land use visible as conflict and never drops/applies it", () => {
    const current = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    current.parcels = [];
    const input = payload();
    input.data.parcels[0].landUses = Array.from({ length: 4 }, (_, index) => ({
      stableKey: `land-${index + 1}`,
      purposeCode: index === 0 ? "ODT" : "GHI_THEO_BIA",
      purposeFreeText: index === 0 ? null : `Mục đích ${index + 1}`,
      area: "10",
      originCode: "NHA_NUOC_CONG_NHAN",
      formCode: "SU_DUNG_RIENG",
      termCode: "SU_DUNG_ON_DINH_LAU_DAI",
    }));
    const suggestions = input.data.parcels[0].landUses.map((landUse) =>
      suggestion(
        "parcels[].landUses[].purposeCode",
        `parcels[parcel-a].landUses[${landUse.stableKey}].purposeCode`,
        landUse.purposeCode ?? "",
      ),
    );
    const comparisons = buildGcnV2BackendComparisons({
      current,
      citizen: structuredClone(current),
      payload: input,
      suggestions,
    });

    expect(comparisons).toHaveLength(4);
    expect(comparisons.filter((entry) => entry.applyable)).toHaveLength(3);
    expect(comparisons[3]).toMatchObject({ provenance: "CONFLICT", applyable: false });
    const applied = applyGcnV2BackendComparisons({ draft: current, comparisons });
    expect(applied.draft.parcels[0].landUses).toHaveLength(3);
  });

  it("applies a complete 18-parcel selection without truncating field paths", () => {
    const current = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    current.parcels = [];
    const input = payload();
    input.data.parcels = Array.from({ length: 18 }, (_, index) => ({
      stableKey: `parcel-${String(index + 1).padStart(2, "0")}`,
      parcelIdCode: `MD-${index + 1}`,
      mapSheetNumber: String(index + 1).padStart(2, "0"),
      parcelNumber: String(100 + index),
      addressOnCertificate: `Thửa ${index + 1}`,
      oldWard: "PHU_HO",
      area: "100",
      landUses: [
        {
          stableKey: `land-${String(index + 1).padStart(2, "0")}`,
          purposeCode: "ODT",
          purposeFreeText: null,
          area: "100",
          originCode: "NHA_NUOC_CONG_NHAN",
          formCode: "SU_DUNG_RIENG",
          termCode: "SU_DUNG_ON_DINH_LAU_DAI",
        },
      ],
    }));
    const suggestions = input.data.parcels.flatMap((parcel) => [
      suggestion(
        "parcels[].mapSheetNumber",
        `parcels[${parcel.stableKey}].mapSheetNumber`,
        parcel.mapSheetNumber ?? "",
      ),
      suggestion(
        "parcels[].parcelNumber",
        `parcels[${parcel.stableKey}].parcelNumber`,
        parcel.parcelNumber ?? "",
      ),
      suggestion(
        "parcels[].addressOnCertificate",
        `parcels[${parcel.stableKey}].addressOnCertificate`,
        parcel.addressOnCertificate ?? "",
      ),
      suggestion("parcels[].area", `parcels[${parcel.stableKey}].area`, parcel.area ?? ""),
      suggestion(
        "parcels[].landUses[].purposeCode",
        `parcels[${parcel.stableKey}].landUses[${parcel.landUses[0].stableKey}].purposeCode`,
        "ODT",
      ),
    ]);
    const comparisons = buildGcnV2BackendComparisons({
      current,
      citizen: structuredClone(current),
      payload: input,
      suggestions,
    });
    const applied = applyGcnV2BackendComparisons({ draft: current, comparisons });

    expect(comparisons).toHaveLength(90);
    expect(applied.appliedFieldPaths).toHaveLength(90);
    expect(applied.draft.parcels).toHaveLength(18);
    expect(applied.draft.parcels.every((parcel) => parcel.landUses.length === 1)).toBe(true);
  });

  it("never overwrites citizen or officer values and rejects a forged selected path", () => {
    const citizen = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    citizen.certificate.issueNumber = "CITIZEN";
    const current = structuredClone(citizen);
    current.certificate.registryNumber = "OFFICER";
    const comparisons = buildGcnV2BackendComparisons({
      current,
      citizen,
      payload: payload(),
      suggestions: [
        suggestion("certificate.issueNumber", "certificate.issueNumber", "AI-1"),
        suggestion("certificate.registryNumber", "certificate.registryNumber", "AI-2"),
      ],
    });

    expect(comparisons.map((entry) => entry.provenance)).toEqual([
      "CITIZEN_PROVIDED",
      "OFFICER_EDITED",
    ]);
    expect(comparisons.every((entry) => !entry.applyable)).toBe(true);
    const applied = applyGcnV2BackendComparisons({
      draft: current,
      comparisons,
      selectedFieldPaths: ["certificate.issueNumber"],
    });
    expect(applied.invalidFieldPaths).toEqual(["certificate.issueNumber"]);
    expect(applied.draft).toBe(current);
  });

  it("allows a newer run to replace only a prior AI-proposed value", () => {
    const current = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    current.certificate.issueDate = "2026-08-01";
    const comparisons = buildGcnV2BackendComparisons({
      current,
      citizen: emptyDraft("owner-existing", "parcel-existing", "land-existing"),
      payload: payload(),
      priorAppliedValues: new Map([["certificate.issueDate", "2026-08-01"]]),
      suggestions: [suggestion("certificate.issueDate", "certificate.issueDate", "2026-08-03")],
    });

    expect(comparisons[0]).toMatchObject({ provenance: "AI_PROPOSED", applyable: true });
    const applied = applyGcnV2BackendComparisons({ draft: current, comparisons });
    expect(applied.draft.certificate.issueDate).toBe("2026-08-03");
  });

  it("blocks unreadable evidence and identity fields already confirmed by an officer", () => {
    const current = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    current.owners[0].identityStatus = "MANUAL_COMPLETE";
    const comparisons = buildGcnV2BackendComparisons({
      current,
      citizen: structuredClone(current),
      payload: payload(),
      suggestions: [
        suggestion("owners[].fullName", "owners[owner-a].fullName", "Nguyễn Văn A"),
        suggestion("parcels[].area", "parcels[parcel-a].area", "120.5", "UNREADABLE"),
      ],
    });

    expect(comparisons[0]).toMatchObject({ provenance: "OFFICER_CONFIRMED", applyable: false });
    expect(comparisons[1]).toMatchObject({ provenance: "UNREADABLE", applyable: false });
  });

  it("keeps registered changes visible as review-only instead of inventing a merge conflict", () => {
    const current = emptyDraft("owner-existing", "parcel-existing", "land-existing");
    const input = payload();
    input.data.registeredChanges = [
      {
        stableKey: "change-alpha",
        confirmedDate: "2026-08-01",
        content: "Nội dung cần cán bộ đối chiếu",
        confirmedBy: "Cơ quan xác nhận",
      },
    ];
    const comparison = buildGcnV2BackendComparisons({
      current,
      citizen: structuredClone(current),
      payload: input,
      suggestions: [
        suggestion(
          "registeredChanges[]",
          "registeredChanges[change-alpha].content",
          "Nội dung cần cán bộ đối chiếu",
        ),
      ],
    })[0];

    expect(comparison).toMatchObject({
      provenance: "EMPTY",
      fieldStatus: "CLEAR",
      applyable: false,
    });
  });
});
