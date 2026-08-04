import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv from "ajv";
import { describe, expect, it } from "vitest";

import {
  GCN_EVIDENCE_STATUSES,
  GCN_PAGE_TYPES,
  GCN_V2_FIELD_CONTRACT,
  GCN_V2_PROMPT_VERSION,
  GCN_V2_SCHEMA_VERSION,
} from "@/modules/ai-extraction/gcn-v2-contract";
import {
  collectGcnV2FieldObservations,
  gcnExtractionPayloadV2Schema,
} from "@/modules/ai-extraction/gcn-v2-schema";
import { scanForCitizenIdLikeValues } from "@/modules/ai-extraction/pii-safety";
import {
  ASSET_TYPE_OPTIONS,
  CERTIFICATE_ROLE_CODES,
  LAND_ORIGIN_OPTIONS,
  LAND_PURPOSE_SELECT_OPTIONS,
  LAND_USE_FORM_OPTIONS,
  LAND_USE_TERM_OPTIONS,
  OLD_WARD_OPTIONS,
} from "@/modules/public-intake/reference";
import { OWNER_TYPES } from "@/modules/public-intake/types";

import { buildSyntheticGcnV2Payload } from "./fixtures/gcn-v2-synthetic";

type JsonSchemaNode = {
  additionalProperties?: boolean;
  const?: unknown;
  enum?: unknown[];
  maxItems?: number;
  minItems?: number;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  definitions?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
  then?: JsonSchemaNode;
  if?: JsonSchemaNode;
};

const promptPath = resolve(process.cwd(), "agent/prompts/certificate-extraction.md");
const schemaPath = resolve(process.cwd(), "agent/schemas/certificate-extraction-schema.json");
const prompt = readFileSync(promptPath, "utf8");
const jsonSchema = JSON.parse(readFileSync(schemaPath, "utf8")) as JsonSchemaNode;
const ajv = new Ajv({ allErrors: true });
const validateJsonSchema = ajv.compile(jsonSchema);

describe("GCN v2 canonical prompt and JSON Schema", () => {
  it("declares the locked version, page-first merge, evidence, normalization, and fail-closed scope", () => {
    expect(prompt).toContain(`schema/prompt version \`${GCN_V2_SCHEMA_VERSION}\``);
    expect(prompt).toContain("đọc từng trang rồi hợp nhất");
    expect(prompt).toContain("0°, 90°, 180° và 270°");
    expect(prompt).toContain("Mỗi field path");
    expect(prompt).toContain("CONFLICT");
    expect(prompt).toContain("rawText");
    expect(prompt).toContain("số 0 đầu");
    expect(prompt).toContain("15–20 thửa");
    expect(prompt).toContain("Không có trường số định danh cá nhân trong output");
    expect(prompt).toContain("không trả `identityNumber`");
    expect(prompt).toContain("`currentUserCitizenId`");
    expect(prompt).toContain("không xác nhận tính pháp lý");
    expect(prompt).toContain("`expectedMetadata`");
    expect(prompt).toContain("`null` sẽ bị submit từ");
  });

  it("keeps strict root/data shape and exact TypeScript enum parity", () => {
    expect(jsonSchema.additionalProperties).toBe(false);
    expect(jsonSchema.required).toEqual([
      "quality",
      "data",
      "pages",
      "evidence",
      "metadata",
      "warnings",
    ]);
    expect(jsonSchema.definitions?.data.required).toEqual([
      "certificate",
      "owners",
      "parcels",
      "assets",
      "registeredChanges",
    ]);
    expect(jsonSchema.definitions?.data.properties?.owners.maxItems).toBe(20);
    expect(jsonSchema.definitions?.data.properties?.parcels.maxItems).toBe(50);
    expect(jsonSchema.properties?.pages.minItems).toBe(1);
    expect(jsonSchema.properties?.pages.maxItems).toBe(200);
    expect(jsonSchema.properties?.evidence.maxItems).toBe(25_000);
    expect(jsonSchema.definitions?.metadata.properties?.schemaVersion.const).toBe(
      GCN_V2_SCHEMA_VERSION,
    );
    expect(jsonSchema.definitions?.metadata.properties?.promptVersion.const).toBe(
      GCN_V2_PROMPT_VERSION,
    );
    expect(enumWithoutNull(jsonSchema.definitions?.owner.properties?.ownerType)).toEqual(
      OWNER_TYPES,
    );
    expect(enumWithoutNull(jsonSchema.definitions?.owner.properties?.roleOnCertificate)).toEqual(
      CERTIFICATE_ROLE_CODES,
    );
    expect(enumWithoutNull(jsonSchema.definitions?.parcel.properties?.oldWard)).toEqual(
      OLD_WARD_OPTIONS.map((option) => option.code),
    );
    expect(enumWithoutNull(jsonSchema.definitions?.landUse.properties?.purposeCode)).toEqual(
      LAND_PURPOSE_SELECT_OPTIONS.map((option) => option.code),
    );
    expect(enumWithoutNull(jsonSchema.definitions?.landUse.properties?.originCode)).toEqual(
      LAND_ORIGIN_OPTIONS.map((option) => option.code),
    );
    expect(enumWithoutNull(jsonSchema.definitions?.landUse.properties?.formCode)).toEqual(
      LAND_USE_FORM_OPTIONS.map((option) => option.code),
    );
    expect(enumWithoutNull(jsonSchema.definitions?.landUse.properties?.termCode)).toEqual(
      LAND_USE_TERM_OPTIONS.map((option) => option.code),
    );
    expect(enumWithoutNull(jsonSchema.definitions?.asset.properties?.assetType)).toEqual(
      ASSET_TYPE_OPTIONS.map((option) => option.code),
    );
    expect(jsonSchema.definitions?.page.properties?.pageType.enum).toEqual(GCN_PAGE_TYPES);
    expect(jsonSchema.definitions?.evidence.properties?.status.enum).toEqual(GCN_EVIDENCE_STATUSES);
  });

  it("does not expose banned identity/current-user/cadastral override properties", () => {
    const propertyNames = collectPropertyNames(jsonSchema);
    for (const forbidden of [
      "identityNumber",
      "currentUserCitizenId",
      "currentUserName",
      "currentUserAddress",
      "hasDistinctCurrentUser",
      "changeReason",
      "addressTwoLevel",
      "cadastralMapSheetNumber",
      "cadastralParcelNumber",
    ]) {
      expect(propertyNames).not.toContain(forbidden);
    }
  });
});

describe("GCN v2 synthetic full-document fixture", () => {
  it("accepts multiple owners, organisation, 18 parcels, three land uses, assets and changes", () => {
    const payload = buildSyntheticGcnV2Payload();
    const zodResult = gcnExtractionPayloadV2Schema.safeParse(payload);

    expect(validateJsonSchema(payload), JSON.stringify(validateJsonSchema.errors)).toBe(true);
    expect(zodResult.success, zodResult.success ? undefined : zodResult.error.message).toBe(true);
    expect(payload.data.owners).toHaveLength(2);
    expect(payload.data.owners.some((owner) => owner.ownerType === "TO_CHUC")).toBe(true);
    expect(payload.data.parcels).toHaveLength(18);
    expect(payload.data.parcels.every((parcel) => parcel.landUses.length === 3)).toBe(true);
    expect(payload.data.assets).toHaveLength(1);
    expect(payload.data.registeredChanges).toHaveLength(1);
    expect(payload.data.parcels[0].mapSheetNumber).toBe("01");
    expect(payload.data.parcels[0].parcelNumber).toBe("001");
    expect(payload.data.assets[0].apartmentNumber).toBe("01");
    expect(payload.pages.map((page) => page.rotationDegrees)).toEqual([0, 90, 180, 0]);
    expect(payload.pages.some((page) => page.pageType === "SUPPLEMENT")).toBe(true);
    expect(payload.pages.some((page) => page.imageStatus === "BLURRY")).toBe(true);
    expect(payload.evidence.some((item) => item.status === "LOW_CONFIDENCE")).toBe(true);
    const nullableLowConfidence = payload.evidence.find(
      (item) => item.fieldPath === "parcels[parcel_016_a1b2c3d4].oldWard",
    );
    expect(nullableLowConfidence).toMatchObject({
      status: "LOW_CONFIDENCE",
      rawText: "Xa cu bi mo",
    });
    expect(payload.data.parcels[15].oldWard).toBeNull();
    expect(payload.evidence.filter((item) => item.status === "CONFLICT")).toHaveLength(2);
    expect(payload.evidence.some((item) => item.status === "UNREADABLE")).toBe(true);
    expect(payload.evidence.some((item) => item.status === "NOT_FOUND")).toBe(true);
    expect(payload.warnings.some((warning) => warning.includes("Thieu anh trang"))).toBe(true);
    expect(scanForCitizenIdLikeValues(payload)).toEqual([]);
  });

  it("covers every field template that the locked contract allows AI to read", () => {
    const payload = buildSyntheticGcnV2Payload();
    const observedTemplates = new Set(
      collectGcnV2FieldObservations(payload).map((item) => item.templatePath),
    );
    const expectedTemplates = new Set(
      GCN_V2_FIELD_CONTRACT.filter((entry) => entry.aiRead).map((entry) => entry.path),
    );

    expect(observedTemplates).toEqual(expectedTemplates);
  });

  it("keeps asset evidence on a page that names the referenced parcel", () => {
    const payload = buildSyntheticGcnV2Payload();
    const asset = payload.data.assets[0];
    const readableAssetEvidence = payload.evidence.filter(
      (item) =>
        item.fieldPath.startsWith(`assets[${asset.stableKey}].`) && item.status === "EXTRACTED",
    );

    expect(readableAssetEvidence.length).toBeGreaterThan(0);
    for (const evidence of readableAssetEvidence) {
      const page = payload.pages.find(
        (candidate) =>
          candidate.fileId === evidence.fileId && candidate.pageNumber === evidence.pageNumber,
      );
      expect(page?.parcelStableKeys).toContain(asset.parcelStableKey);
    }
  });
});

describe("GCN v2 schema fail-closed cases", () => {
  it("rejects extra root and nested properties in both JSON Schema and Zod", () => {
    const extraRoot = structuredClone(buildSyntheticGcnV2Payload()) as unknown as Record<
      string,
      unknown
    >;
    extraRoot.reasoning = "not allowed";
    expect(validateJsonSchema(extraRoot)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(extraRoot).success).toBe(false);

    const extraNested = structuredClone(buildSyntheticGcnV2Payload());
    const ownerWithExtra = extraNested.data.owners[0] as unknown as Record<string, unknown>;
    ownerWithExtra.identityNumber = "redacted";
    expect(validateJsonSchema(extraNested)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(extraNested).success).toBe(false);
  });

  it("rejects invalid enum, comma decimal, impossible date, and lost leading-zero number type", () => {
    const invalidEnum = structuredClone(buildSyntheticGcnV2Payload());
    invalidEnum.data.owners[0].ownerType = "UNKNOWN_OWNER";
    expect(validateJsonSchema(invalidEnum)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(invalidEnum).success).toBe(false);

    const commaDecimal = structuredClone(buildSyntheticGcnV2Payload());
    commaDecimal.data.parcels[0].area = "08,50";
    expect(validateJsonSchema(commaDecimal)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(commaDecimal).success).toBe(false);

    const impossibleDate = structuredClone(buildSyntheticGcnV2Payload());
    impossibleDate.data.certificate.issueDate = "2026-02-30";
    expect(gcnExtractionPayloadV2Schema.safeParse(impossibleDate).success).toBe(false);

    const whitespaceOnly = structuredClone(buildSyntheticGcnV2Payload());
    whitespaceOnly.data.certificate.issueNumber = "   ";
    expect(validateJsonSchema(whitespaceOnly)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(whitespaceOnly).success).toBe(false);

    const numericParcel = structuredClone(buildSyntheticGcnV2Payload()) as unknown as {
      data: { parcels: Array<{ parcelNumber: unknown }> };
    };
    numericParcel.data.parcels[0].parcelNumber = 1;
    expect(validateJsonSchema(numericParcel)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(numericParcel).success).toBe(false);
  });

  it("rejects missing evidence, mismatched pagesProcessed, and conflict with a chosen value", () => {
    const missingEvidence = structuredClone(buildSyntheticGcnV2Payload());
    missingEvidence.evidence = missingEvidence.evidence.filter(
      (item) => item.fieldPath !== "certificate.issueNumber",
    );
    expect(gcnExtractionPayloadV2Schema.safeParse(missingEvidence).success).toBe(false);

    const wrongPageCount = structuredClone(buildSyntheticGcnV2Payload());
    wrongPageCount.metadata.pagesProcessed += 1;
    expect(gcnExtractionPayloadV2Schema.safeParse(wrongPageCount).success).toBe(false);

    const chosenConflict = structuredClone(buildSyntheticGcnV2Payload());
    chosenConflict.data.parcels[17].parcelNumber = "018";
    expect(gcnExtractionPayloadV2Schema.safeParse(chosenConflict).success).toBe(false);
  });

  it("rejects broken stable keys, duplicate keys, unknown references, and off-page asset evidence", () => {
    const invalidKey = structuredClone(buildSyntheticGcnV2Payload());
    invalidKey.data.owners[0].stableKey = "short";
    expect(validateJsonSchema(invalidKey)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(invalidKey).success).toBe(false);

    const duplicateKey = structuredClone(buildSyntheticGcnV2Payload());
    duplicateKey.data.assets[0].stableKey = duplicateKey.data.owners[0].stableKey;
    expect(gcnExtractionPayloadV2Schema.safeParse(duplicateKey).success).toBe(false);

    const unknownParcel = structuredClone(buildSyntheticGcnV2Payload());
    unknownParcel.data.assets[0].parcelStableKey = "parcel_deadbeefdeadbeef";
    expect(gcnExtractionPayloadV2Schema.safeParse(unknownParcel).success).toBe(false);

    const offPageEvidence = structuredClone(buildSyntheticGcnV2Payload());
    for (const evidence of offPageEvidence.evidence) {
      if (evidence.fieldPath.startsWith("assets[")) {
        evidence.fileId = "gcn-file-supplement-c";
      }
    }
    expect(gcnExtractionPayloadV2Schema.safeParse(offPageEvidence).success).toBe(false);
  });

  it("rejects incomplete readable, NOT_FOUND, and CONFLICT evidence", () => {
    const incompleteReadable = structuredClone(buildSyntheticGcnV2Payload());
    incompleteReadable.evidence[0].rawText = null;
    incompleteReadable.evidence[0].confidence = null;
    expect(validateJsonSchema(incompleteReadable)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(incompleteReadable).success).toBe(false);

    const rawNotFound = structuredClone(buildSyntheticGcnV2Payload());
    const notFound = rawNotFound.evidence.find((item) => item.status === "NOT_FOUND");
    expect(notFound).toBeDefined();
    if (notFound) notFound.confidence = 0.5;
    expect(validateJsonSchema(rawNotFound)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(rawNotFound).success).toBe(false);

    const incompleteConflict = structuredClone(buildSyntheticGcnV2Payload());
    const conflict = incompleteConflict.evidence.find((item) => item.status === "CONFLICT");
    expect(conflict).toBeDefined();
    if (conflict) conflict.rawText = null;
    expect(validateJsonSchema(incompleteConflict)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(incompleteConflict).success).toBe(false);

    const oneConflictSource = structuredClone(buildSyntheticGcnV2Payload());
    const conflictPath = oneConflictSource.evidence.find(
      (item) => item.status === "CONFLICT",
    )?.fieldPath;
    oneConflictSource.evidence = oneConflictSource.evidence.filter(
      (item) =>
        item.status !== "CONFLICT" || item.fieldPath !== conflictPath || item.rawText !== "016?",
    );
    expect(gcnExtractionPayloadV2Schema.safeParse(oneConflictSource).success).toBe(false);
  });

  it("rejects collection overflow and invalid metadata", () => {
    const tooManyLandUses = structuredClone(buildSyntheticGcnV2Payload());
    const prototype = tooManyLandUses.data.parcels[0].landUses[0];
    tooManyLandUses.data.parcels[0].landUses = Array.from({ length: 21 }, (_, index) => ({
      ...prototype,
      stableKey: `landuse_overflow_${String(index).padStart(3, "0")}`,
    }));
    expect(validateJsonSchema(tooManyLandUses)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(tooManyLandUses).success).toBe(false);

    const wrongVersion = structuredClone(buildSyntheticGcnV2Payload()) as unknown as {
      metadata: { schemaVersion: string };
    };
    wrongVersion.metadata.schemaVersion = "v2.0";
    expect(validateJsonSchema(wrongVersion)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(wrongVersion).success).toBe(false);

    const invalidHash = structuredClone(buildSyntheticGcnV2Payload());
    invalidHash.metadata.sourceDocumentHash = "not-a-sha256";
    expect(validateJsonSchema(invalidHash)).toBe(false);
    expect(gcnExtractionPayloadV2Schema.safeParse(invalidHash).success).toBe(false);
  });

  it("keeps the existing 12-digit citizen-ID guard fail-closed", () => {
    const payload = structuredClone(buildSyntheticGcnV2Payload());
    payload.warnings.push("Gia tri bi cam: 123456789012");

    expect(scanForCitizenIdLikeValues(payload)).toEqual([{ fieldPath: "warnings[2]" }]);
  });
});

function enumWithoutNull(node: JsonSchemaNode | undefined): readonly string[] {
  return (node?.enum ?? []).filter((value): value is string => typeof value === "string");
}

function collectPropertyNames(node: JsonSchemaNode): string[] {
  const names = Object.keys(node.properties ?? {});
  for (const child of Object.values(node.properties ?? {}))
    names.push(...collectPropertyNames(child));
  for (const definition of Object.values(node.definitions ?? {})) {
    names.push(...collectPropertyNames(definition));
  }
  for (const child of node.anyOf ?? []) names.push(...collectPropertyNames(child));
  for (const child of node.allOf ?? []) names.push(...collectPropertyNames(child));
  if (node.items) names.push(...collectPropertyNames(node.items));
  if (node.if) names.push(...collectPropertyNames(node.if));
  if (node.then) names.push(...collectPropertyNames(node.then));
  return names;
}
