import { z } from "zod";

import {
  GCN_EVIDENCE_STATUSES,
  GCN_PAGE_TYPES,
  GCN_V2_PROMPT_VERSION,
  GCN_V2_SCHEMA_VERSION,
  type GcnEvidenceStatus,
  type GcnExtractionPayloadV2,
  type GcnV2FieldTemplate,
} from "./gcn-v2-contract";
import {
  ASSET_TYPE_OPTIONS,
  CERTIFICATE_ROLE_CODES,
  LAND_ORIGIN_OPTIONS,
  LAND_PURPOSE_SELECT_OPTIONS,
  LAND_USE_FORM_OPTIONS,
  LAND_USE_TERM_OPTIONS,
  OLD_WARD_OPTIONS,
} from "../public-intake/reference";
import { OWNER_TYPES } from "../public-intake/types";

const MAX_SHORT_TEXT = 200;
const MAX_LONG_TEXT = 2_000;
const MAX_COLLECTION_SIZE = 200;
const MAX_OWNERS = 20;
const MAX_PARCELS = 50;
const MAX_LAND_USES_PER_EXTRACTED_PARCEL = 20;
const MAX_EVIDENCE_ENTRIES = 25_000;
const STABLE_KEY_PATTERN = /^[a-z][a-z0-9_-]{7,99}$/;
const SOURCE_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function optionCodes(options: readonly { readonly code: string }[]): [string, ...string[]] {
  const codes = options.map((option) => option.code);
  if (codes.length === 0) throw new Error("Danh mục GCN v2 không được rỗng.");
  return codes as [string, ...string[]];
}

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isIsoDateTime(value: string): boolean {
  if (!/T/.test(value) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

const nullableShortTextSchema = z.string().trim().min(1).max(MAX_SHORT_TEXT).nullable();
const nullableLongTextSchema = z.string().trim().min(1).max(MAX_LONG_TEXT).nullable();
const nullableIsoDateSchema = z
  .string()
  .trim()
  .refine(isRealIsoDate, "Ngày phải là ngày có thật theo định dạng YYYY-MM-DD.")
  .nullable();
const nullableDecimalSchema = z
  .string()
  .trim()
  .regex(DECIMAL_PATTERN, "Diện tích phải là chuỗi thập phân không kèm đơn vị.")
  .nullable();
const stableKeySchema = z.string().trim().regex(STABLE_KEY_PATTERN);

const ownerSchema = z
  .object({
    stableKey: stableKeySchema,
    ownerType: z.enum(OWNER_TYPES).nullable(),
    organisationName: nullableShortTextSchema,
    organisationIdentityNumber: nullableShortTextSchema,
    fullName: nullableShortTextSchema,
    dateOfBirth: nullableIsoDateSchema,
    gender: z.enum(["NAM", "NU"]).nullable(),
    residenceAddress: nullableLongTextSchema,
    roleOnCertificate: z
      .enum(optionCodes(CERTIFICATE_ROLE_CODES.map((code) => ({ code }))))
      .nullable(),
  })
  .strict();

const landUseSchema = z
  .object({
    stableKey: stableKeySchema,
    purposeCode: z.enum(optionCodes(LAND_PURPOSE_SELECT_OPTIONS)).nullable(),
    purposeFreeText: nullableShortTextSchema,
    area: nullableDecimalSchema,
    originCode: z.enum(optionCodes(LAND_ORIGIN_OPTIONS)).nullable(),
    formCode: z.enum(optionCodes(LAND_USE_FORM_OPTIONS)).nullable(),
    termCode: z.enum(optionCodes(LAND_USE_TERM_OPTIONS)).nullable(),
  })
  .strict();

const parcelSchema = z
  .object({
    stableKey: stableKeySchema,
    parcelIdCode: nullableShortTextSchema,
    mapSheetNumber: nullableShortTextSchema,
    parcelNumber: nullableShortTextSchema,
    addressOnCertificate: nullableLongTextSchema,
    oldWard: z.enum(optionCodes(OLD_WARD_OPTIONS)).nullable(),
    area: nullableDecimalSchema,
    landUses: z.array(landUseSchema).max(MAX_LAND_USES_PER_EXTRACTED_PARCEL),
  })
  .strict();

const assetSchema = z
  .object({
    stableKey: stableKeySchema,
    parcelStableKey: stableKeySchema.nullable(),
    assetType: z.enum(optionCodes(ASSET_TYPE_OPTIONS)).nullable(),
    description: nullableLongTextSchema,
    mixedUseBuildingName: nullableShortTextSchema,
    apartmentBuildingName: nullableShortTextSchema,
    apartmentNumber: nullableShortTextSchema,
    constructionArea: nullableDecimalSchema,
    floorArea: nullableDecimalSchema,
    ownershipForm: nullableShortTextSchema,
    ownershipTerm: nullableShortTextSchema,
    grade: nullableShortTextSchema,
  })
  .strict();

const registeredChangeSchema = z
  .object({
    stableKey: stableKeySchema,
    confirmedDate: nullableIsoDateSchema,
    content: nullableLongTextSchema,
    confirmedBy: nullableShortTextSchema,
  })
  .strict();

const evidenceSchema = z
  .object({
    fieldPath: z.string().trim().min(1).max(500),
    rawText: nullableLongTextSchema,
    fileId: z.string().trim().min(1).max(100),
    pageNumber: z.number().int().min(1).max(10_000).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    status: z.enum(GCN_EVIDENCE_STATUSES),
  })
  .strict();

const pageSchema = z
  .object({
    fileId: z.string().trim().min(1).max(100),
    pageNumber: z.number().int().min(1).max(10_000),
    pageType: z.enum(GCN_PAGE_TYPES),
    rotationDegrees: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    imageStatus: z.enum(["CLEAR", "BLURRY", "HANDWRITING", "MIXED"]),
    ownerStableKeys: z.array(stableKeySchema).max(MAX_COLLECTION_SIZE),
    parcelStableKeys: z.array(stableKeySchema).max(MAX_COLLECTION_SIZE),
    registeredChangeStableKeys: z.array(stableKeySchema).max(MAX_COLLECTION_SIZE),
    warnings: z.array(z.string().trim().min(1).max(500)).max(50),
  })
  .strict();

const baseGcnExtractionPayloadV2Schema = z
  .object({
    quality: z
      .object({
        documentType: z.enum(["CERTIFICATE", "OTHER", "UNKNOWN"]),
        imageStatus: z.enum(["CLEAR", "BLURRY", "HANDWRITING", "MIXED"]),
        note: z.string().trim().max(500),
      })
      .strict(),
    data: z
      .object({
        certificate: z
          .object({
            issueNumber: nullableShortTextSchema,
            issueDate: nullableIsoDateSchema,
            registryNumber: nullableShortTextSchema,
          })
          .strict(),
        owners: z.array(ownerSchema).max(MAX_OWNERS),
        parcels: z.array(parcelSchema).max(MAX_PARCELS),
        assets: z.array(assetSchema).max(MAX_COLLECTION_SIZE),
        registeredChanges: z.array(registeredChangeSchema).max(MAX_COLLECTION_SIZE),
      })
      .strict(),
    pages: z.array(pageSchema).min(1).max(MAX_COLLECTION_SIZE),
    evidence: z.array(evidenceSchema).min(3).max(MAX_EVIDENCE_ENTRIES),
    metadata: z
      .object({
        schemaVersion: z.literal(GCN_V2_SCHEMA_VERSION),
        promptVersion: z.literal(GCN_V2_PROMPT_VERSION),
        modelIdentifier: z.string().trim().min(1).max(120),
        pagesProcessed: z.number().int().min(1).max(MAX_COLLECTION_SIZE),
        sourceDocumentHash: z.string().trim().regex(SOURCE_HASH_PATTERN).nullable(),
        processedAt: z.string().trim().refine(isIsoDateTime, "processedAt phải là ISO datetime."),
      })
      .strict(),
    warnings: z.array(z.string().trim().min(1).max(500)).max(200),
  })
  .strict();

export interface GcnV2FieldObservation {
  readonly fieldPath: string;
  readonly templatePath: GcnV2FieldTemplate;
  readonly stableKey: string | null;
  readonly value: string | null;
}

/**
 * Trải payload thành các lá có đường dẫn ổn định. Evidence, comparison và merger dùng cùng hàm
 * này để không tự khai lại danh sách trường ở ba nơi khác nhau.
 */
export function collectGcnV2FieldObservations(
  payload: Pick<GcnExtractionPayloadV2, "data">,
): GcnV2FieldObservation[] {
  const observations: GcnV2FieldObservation[] = [
    observation(
      "certificate.issueNumber",
      "certificate.issueNumber",
      null,
      payload.data.certificate.issueNumber,
    ),
    observation(
      "certificate.issueDate",
      "certificate.issueDate",
      null,
      payload.data.certificate.issueDate,
    ),
    observation(
      "certificate.registryNumber",
      "certificate.registryNumber",
      null,
      payload.data.certificate.registryNumber,
    ),
  ];
  for (const owner of payload.data.owners) {
    const prefix = `owners[${owner.stableKey}]`;
    observations.push(
      observation(`${prefix}.ownerType`, "owners[].ownerType", owner.stableKey, owner.ownerType),
      observation(
        `${prefix}.organisationName`,
        "owners[].organisationName",
        owner.stableKey,
        owner.organisationName,
      ),
      observation(
        `${prefix}.organisationIdentityNumber`,
        "owners[].organisationIdentityNumber",
        owner.stableKey,
        owner.organisationIdentityNumber,
      ),
      observation(`${prefix}.fullName`, "owners[].fullName", owner.stableKey, owner.fullName),
      observation(
        `${prefix}.dateOfBirth`,
        "owners[].dateOfBirth",
        owner.stableKey,
        owner.dateOfBirth,
      ),
      observation(`${prefix}.gender`, "owners[].gender", owner.stableKey, owner.gender),
      observation(
        `${prefix}.residenceAddress`,
        "owners[].residenceAddress",
        owner.stableKey,
        owner.residenceAddress,
      ),
      observation(
        `${prefix}.roleOnCertificate`,
        "owners[].roleOnCertificate",
        owner.stableKey,
        owner.roleOnCertificate,
      ),
    );
  }
  for (const parcel of payload.data.parcels) {
    const prefix = `parcels[${parcel.stableKey}]`;
    observations.push(
      observation(
        `${prefix}.parcelIdCode`,
        "parcels[].parcelIdCode",
        parcel.stableKey,
        parcel.parcelIdCode,
      ),
      observation(
        `${prefix}.mapSheetNumber`,
        "parcels[].mapSheetNumber",
        parcel.stableKey,
        parcel.mapSheetNumber,
      ),
      observation(
        `${prefix}.parcelNumber`,
        "parcels[].parcelNumber",
        parcel.stableKey,
        parcel.parcelNumber,
      ),
      observation(
        `${prefix}.addressOnCertificate`,
        "parcels[].addressOnCertificate",
        parcel.stableKey,
        parcel.addressOnCertificate,
      ),
      observation(`${prefix}.oldWard`, "parcels[].oldWard", parcel.stableKey, parcel.oldWard),
      observation(`${prefix}.area`, "parcels[].area", parcel.stableKey, parcel.area),
    );
    for (const landUse of parcel.landUses) {
      const landUsePrefix = `${prefix}.landUses[${landUse.stableKey}]`;
      observations.push(
        observation(
          `${landUsePrefix}.purposeCode`,
          "parcels[].landUses[].purposeCode",
          landUse.stableKey,
          landUse.purposeCode,
        ),
        observation(
          `${landUsePrefix}.purposeFreeText`,
          "parcels[].landUses[].purposeFreeText",
          landUse.stableKey,
          landUse.purposeFreeText,
        ),
        observation(
          `${landUsePrefix}.area`,
          "parcels[].landUses[].area",
          landUse.stableKey,
          landUse.area,
        ),
        observation(
          `${landUsePrefix}.originCode`,
          "parcels[].landUses[].originCode",
          landUse.stableKey,
          landUse.originCode,
        ),
        observation(
          `${landUsePrefix}.formCode`,
          "parcels[].landUses[].formCode",
          landUse.stableKey,
          landUse.formCode,
        ),
        observation(
          `${landUsePrefix}.termCode`,
          "parcels[].landUses[].termCode",
          landUse.stableKey,
          landUse.termCode,
        ),
      );
    }
  }
  for (const asset of payload.data.assets) {
    const prefix = `assets[${asset.stableKey}]`;
    observations.push(
      observation(`${prefix}.assetType`, "assets[].assetType", asset.stableKey, asset.assetType),
      observation(
        `${prefix}.description`,
        "assets[].description",
        asset.stableKey,
        asset.description,
      ),
      observation(
        `${prefix}.mixedUseBuildingName`,
        "assets[].mixedUseBuildingName",
        asset.stableKey,
        asset.mixedUseBuildingName,
      ),
      observation(
        `${prefix}.apartmentBuildingName`,
        "assets[].apartmentBuildingName",
        asset.stableKey,
        asset.apartmentBuildingName,
      ),
      observation(
        `${prefix}.apartmentNumber`,
        "assets[].apartmentNumber",
        asset.stableKey,
        asset.apartmentNumber,
      ),
      observation(
        `${prefix}.constructionArea`,
        "assets[].constructionArea",
        asset.stableKey,
        asset.constructionArea,
      ),
      observation(`${prefix}.floorArea`, "assets[].floorArea", asset.stableKey, asset.floorArea),
      observation(
        `${prefix}.ownershipForm`,
        "assets[].ownershipForm",
        asset.stableKey,
        asset.ownershipForm,
      ),
      observation(
        `${prefix}.ownershipTerm`,
        "assets[].ownershipTerm",
        asset.stableKey,
        asset.ownershipTerm,
      ),
      observation(`${prefix}.grade`, "assets[].grade", asset.stableKey, asset.grade),
    );
  }
  for (const change of payload.data.registeredChanges) {
    const prefix = `registeredChanges[${change.stableKey}]`;
    observations.push(
      observation(
        `${prefix}.confirmedDate`,
        "registeredChanges[].confirmedDate",
        change.stableKey,
        change.confirmedDate,
      ),
      observation(
        `${prefix}.content`,
        "registeredChanges[].content",
        change.stableKey,
        change.content,
      ),
      observation(
        `${prefix}.confirmedBy`,
        "registeredChanges[].confirmedBy",
        change.stableKey,
        change.confirmedBy,
      ),
    );
  }
  return observations;
}

function observation(
  fieldPath: string,
  templatePath: GcnV2FieldTemplate,
  stableKey: string | null,
  value: string | null,
): GcnV2FieldObservation {
  return { fieldPath, templatePath, stableKey, value };
}

function addPayloadIntegrityIssues(
  payload: z.infer<typeof baseGcnExtractionPayloadV2Schema>,
  context: z.RefinementCtx,
): void {
  if (payload.metadata.pagesProcessed !== payload.pages.length) {
    context.addIssue({
      code: "custom",
      path: ["metadata", "pagesProcessed"],
      message: "pagesProcessed phải bằng đúng số phần tử pages.",
    });
  }

  const pageKeys = new Set<string>();
  const pageFileIds = new Set<string>();
  for (const [index, page] of payload.pages.entries()) {
    const pageKey = `${page.fileId}\u0000${page.pageNumber}`;
    if (pageKeys.has(pageKey)) {
      context.addIssue({ code: "custom", path: ["pages", index], message: "Trang bị lặp." });
    }
    pageKeys.add(pageKey);
    pageFileIds.add(page.fileId);
  }

  const observations = collectGcnV2FieldObservations(payload);
  const observationByPath = new Map(observations.map((item) => [item.fieldPath, item]));
  const evidenceByPath = new Map<string, typeof payload.evidence>();
  for (const [index, evidence] of payload.evidence.entries()) {
    if (!pageFileIds.has(evidence.fileId)) {
      context.addIssue({
        code: "custom",
        path: ["evidence", index, "fileId"],
        message: "Evidence phải trỏ tới file có trong pages.",
      });
    }
    if (
      evidence.pageNumber !== null &&
      !pageKeys.has(`${evidence.fileId}\u0000${evidence.pageNumber}`)
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence", index, "pageNumber"],
        message: "Evidence phải trỏ tới đúng file/trang có trong pages.",
      });
    }
    const observation = observationByPath.get(evidence.fieldPath);
    if (!observation) {
      context.addIssue({
        code: "custom",
        path: ["evidence", index, "fieldPath"],
        message: "Evidence trỏ tới trường không tồn tại trong data.",
      });
      continue;
    }
    const entries = evidenceByPath.get(evidence.fieldPath) ?? [];
    entries.push(evidence);
    evidenceByPath.set(evidence.fieldPath, entries);
    const hasReadableValue =
      evidence.status === "EXTRACTED" || evidence.status === "LOW_CONFIDENCE";
    if (hasReadableValue && (evidence.rawText === null || evidence.confidence === null)) {
      context.addIssue({
        code: "custom",
        path: ["evidence", index],
        message: `${evidence.status} bắt buộc có rawText và confidence từ 0 đến 1.`,
      });
    }
    if (
      evidence.status === "NOT_FOUND" &&
      (evidence.rawText !== null || evidence.confidence !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence", index],
        message: "NOT_FOUND phải có rawText và confidence bằng null.",
      });
    }
    if (evidence.status === "CONFLICT" && evidence.rawText === null) {
      context.addIssue({
        code: "custom",
        path: ["evidence", index, "rawText"],
        message: "CONFLICT bắt buộc giữ rawText của từng nguồn mâu thuẫn.",
      });
    }
  }

  for (const observationItem of observations) {
    const evidenceEntries = evidenceByPath.get(observationItem.fieldPath) ?? [];
    if (evidenceEntries.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: `Thiếu evidence cho ${observationItem.fieldPath}.`,
      });
      continue;
    }
    const statuses = new Set(evidenceEntries.map((entry) => entry.status));
    if (observationItem.value === null) {
      if (statuses.has("EXTRACTED")) {
        context.addIssue({
          code: "custom",
          path: ["evidence"],
          message: `${observationItem.fieldPath} không có value nhưng evidence khai EXTRACTED.`,
        });
      }
    } else if (!statuses.has("EXTRACTED") && !statuses.has("LOW_CONFIDENCE")) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: `${observationItem.fieldPath} có value nhưng không có evidence đọc được.`,
      });
    }
    if (statuses.has("CONFLICT") && observationItem.value !== null) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: `${observationItem.fieldPath} đang CONFLICT nên value phải là null.`,
      });
    }
    if (statuses.has("CONFLICT")) {
      const conflictSources = new Set(
        evidenceEntries
          .filter((entry) => entry.status === "CONFLICT" && entry.rawText !== null)
          .map(
            (entry) => `${entry.fileId}\u0000${entry.pageNumber ?? ""}\u0000${entry.rawText ?? ""}`,
          ),
      );
      if (conflictSources.size < 2) {
        context.addIssue({
          code: "custom",
          path: ["evidence"],
          message: `${observationItem.fieldPath} CONFLICT phải có ít nhất hai nguồn raw khác nhau.`,
        });
      }
    }
  }

  const allStableKeys: string[] = [
    ...payload.data.owners.map((item) => item.stableKey),
    ...payload.data.parcels.map((item) => item.stableKey),
    ...payload.data.parcels.flatMap((parcel) => parcel.landUses.map((item) => item.stableKey)),
    ...payload.data.assets.map((item) => item.stableKey),
    ...payload.data.registeredChanges.map((item) => item.stableKey),
  ];
  const stableKeySet = new Set<string>();
  for (const stableKey of allStableKeys) {
    if (stableKeySet.has(stableKey)) {
      context.addIssue({
        code: "custom",
        path: ["data"],
        message: `stableKey bị lặp: ${stableKey}.`,
      });
    }
    stableKeySet.add(stableKey);
  }

  const parcelKeys = new Set(payload.data.parcels.map((parcel) => parcel.stableKey));
  for (const [index, asset] of payload.data.assets.entries()) {
    if (asset.parcelStableKey !== null && !parcelKeys.has(asset.parcelStableKey)) {
      context.addIssue({
        code: "custom",
        path: ["data", "assets", index, "parcelStableKey"],
        message: "parcelStableKey của tài sản không trỏ tới thửa trong payload.",
      });
    }
    if (asset.parcelStableKey !== null) {
      const prefix = `assets[${asset.stableKey}].`;
      const hasRelationshipEvidence = payload.evidence.some((evidence) => {
        if (!evidence.fieldPath.startsWith(prefix) || evidence.pageNumber === null) return false;
        if (evidence.status === "NOT_FOUND" || evidence.status === "UNREADABLE") return false;
        return payload.pages.some(
          (page) =>
            page.fileId === evidence.fileId &&
            page.pageNumber === evidence.pageNumber &&
            page.parcelStableKeys.includes(asset.parcelStableKey as string),
        );
      });
      if (!hasRelationshipEvidence) {
        context.addIssue({
          code: "custom",
          path: ["data", "assets", index, "parcelStableKey"],
          message:
            "Liên kết tài sản-thửa phải được chứng minh bởi evidence tài sản trên trang có thửa đó.",
        });
      }
    }
  }

  const ownerKeys = new Set(payload.data.owners.map((owner) => owner.stableKey));
  const changeKeys = new Set(payload.data.registeredChanges.map((change) => change.stableKey));
  for (const [index, page] of payload.pages.entries()) {
    for (const key of page.ownerStableKeys) {
      if (!ownerKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["pages", index, "ownerStableKeys"],
          message: "ownerStableKeys chứa khóa không tồn tại.",
        });
      }
    }
    for (const key of page.parcelStableKeys) {
      if (!parcelKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["pages", index, "parcelStableKeys"],
          message: "parcelStableKeys chứa khóa không tồn tại.",
        });
      }
    }
    for (const key of page.registeredChangeStableKeys) {
      if (!changeKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["pages", index, "registeredChangeStableKeys"],
          message: "registeredChangeStableKeys chứa khóa không tồn tại.",
        });
      }
    }
  }
}

export const gcnExtractionPayloadV2Schema = baseGcnExtractionPayloadV2Schema.superRefine(
  addPayloadIntegrityIssues,
) as z.ZodType<GcnExtractionPayloadV2>;

export interface GcnV2EvidenceIssue {
  readonly fieldPath: string;
  readonly code:
    | "V2_EVIDENCE_MISSING"
    | "V2_EVIDENCE_NOT_IN_MANIFEST"
    | "V2_EVIDENCE_PAGE_UNKNOWN"
    | "V2_EXTRACTED_EVIDENCE_INCOMPLETE"
    | "V2_ASSET_PARCEL_LINK_UNSUPPORTED";
}

/** Kiểm lại evidence khi đọc bản ghi đã lưu và khi đã có manifest thực tế của job. */
export function findInvalidGcnV2Evidence(
  payload: GcnExtractionPayloadV2,
  allowedFileIds?: ReadonlySet<string>,
): GcnV2EvidenceIssue[] {
  const issues: GcnV2EvidenceIssue[] = [];
  const pageKeys = new Set(payload.pages.map((page) => `${page.fileId}\u0000${page.pageNumber}`));
  const evidencePaths = new Set(payload.evidence.map((item) => item.fieldPath));
  for (const observationItem of collectGcnV2FieldObservations(payload)) {
    if (!evidencePaths.has(observationItem.fieldPath)) {
      issues.push({ fieldPath: observationItem.fieldPath, code: "V2_EVIDENCE_MISSING" });
    }
  }
  for (const evidence of payload.evidence) {
    if (allowedFileIds && !allowedFileIds.has(evidence.fileId)) {
      issues.push({ fieldPath: evidence.fieldPath, code: "V2_EVIDENCE_NOT_IN_MANIFEST" });
    }
    if (
      evidence.pageNumber !== null &&
      !pageKeys.has(`${evidence.fileId}\u0000${evidence.pageNumber}`)
    ) {
      issues.push({ fieldPath: evidence.fieldPath, code: "V2_EVIDENCE_PAGE_UNKNOWN" });
    }
    if (
      (evidence.status === "EXTRACTED" || evidence.status === "LOW_CONFIDENCE") &&
      (evidence.rawText === null || evidence.confidence === null)
    ) {
      issues.push({ fieldPath: evidence.fieldPath, code: "V2_EXTRACTED_EVIDENCE_INCOMPLETE" });
    }
  }
  for (const asset of payload.data.assets) {
    if (asset.parcelStableKey === null) continue;
    const prefix = `assets[${asset.stableKey}].`;
    const supported = payload.evidence.some((evidence) => {
      if (!evidence.fieldPath.startsWith(prefix) || evidence.pageNumber === null) return false;
      if (evidence.status === "NOT_FOUND" || evidence.status === "UNREADABLE") return false;
      return payload.pages.some(
        (page) =>
          page.fileId === evidence.fileId &&
          page.pageNumber === evidence.pageNumber &&
          page.parcelStableKeys.includes(asset.parcelStableKey as string),
      );
    });
    if (!supported) {
      issues.push({
        fieldPath: `assets[${asset.stableKey}].parcelStableKey`,
        code: "V2_ASSET_PARCEL_LINK_UNSUPPORTED",
      });
    }
  }
  return issues;
}

export function gcnEvidenceStatusToLegacyFieldStatus(
  status: GcnEvidenceStatus,
): "CLEAR" | "CHECK" | "MANUAL_REQUIRED" {
  if (status === "EXTRACTED") return "CLEAR";
  if (status === "LOW_CONFIDENCE" || status === "CONFLICT") return "CHECK";
  return "MANUAL_REQUIRED";
}

export function isGcnExtractionPayloadV2(value: unknown): value is GcnExtractionPayloadV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const metadata = record.metadata;
  return (
    !!metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).schemaVersion === GCN_V2_SCHEMA_VERSION
  );
}
