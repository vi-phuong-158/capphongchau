import { createHash } from "node:crypto";

import {
  GCN_V2_FIELD_CONTRACT,
  type GcnEvidenceStatus,
  type GcnExtractionPayloadV2,
  type GcnFieldProvenance,
} from "./gcn-v2-contract";
import { buildGcnV2FieldComparisons } from "./draft";
import {
  emptyAsset,
  emptyLandUse,
  emptyOwner,
  emptyParcel,
  MAX_LAND_USES_PER_PARCEL,
  migrateLegacyOrganisationOwner,
  OWNER_TYPES,
  type Asset,
  type IntakeDraft,
  type LandUse,
  type Owner,
  type Parcel,
} from "../public-intake/types";
import { draftSchema, validateWorkingPayloadForSave } from "../public-intake/validation";

export type PersistedAiFieldStatus = "CLEAR" | "CHECK" | "MANUAL_REQUIRED";

const PERSONAL_INFO_NOTE_MARKERS: readonly RegExp[] = [
  /ho\s+(va\s+)?ten/i,
  /ngay\s+sinh/i,
  /nam\s+sinh/i,
  /gioi\s+tinh/i,
  /dia\s+chi/i,
  /thuong\s+tru/i,
  /so\s+dinh\s+danh/i,
  /\bcccd\b/i,
  /\bcmnd\b/i,
];

/** Chỉ quét note/warning; tên và địa chỉ ở data/evidence là output nghiệp vụ hợp lệ của GCN v2. */
export function findGcnV2PersonalInfoInNotes(payload: GcnExtractionPayloadV2): string[] {
  const fields: [string, string][] = [
    ["quality.note", payload.quality.note],
    ...payload.warnings.map((warning, index): [string, string] => [`warnings[${index}]`, warning]),
    ...payload.pages.flatMap((page, pageIndex) =>
      page.warnings.map((warning, warningIndex): [string, string] => [
        `pages[${pageIndex}].warnings[${warningIndex}]`,
        warning,
      ]),
    ),
  ];
  return fields
    .filter(([, value]) => {
      const folded = value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d");
      return PERSONAL_INFO_NOTE_MARKERS.some((marker) => marker.test(folded));
    })
    .map(([fieldPath]) => fieldPath);
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function storedString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * JSON các giai đoạn cũ có thể thiếu assets và các trường PL3 bổ sung. Hydrate về IntakeDraft
 * hiện hành trước khi so sánh/apply; bỏ khóa lạ thay vì đưa chúng qua `draftSchema.strict()`.
 */
export function hydrateGcnV2ApplicationDraft(value: unknown): IntakeDraft | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return null;
    }
  }
  const root = recordOf(parsed);
  if (!root) return null;
  const certificate = recordOf(root.certificate) ?? {};
  const owners = Array.isArray(root.owners)
    ? root.owners.flatMap((rawOwner, index) => {
        const source = recordOf(rawOwner);
        if (!source) return [];
        const base = emptyOwner(storedString(source.id) || `legacy_owner_${index}`);
        const ownerType = storedString(source.ownerType);
        const owner = {
          ...base,
          ownerType: OWNER_TYPES.includes(ownerType as Owner["ownerType"])
            ? (ownerType as Owner["ownerType"])
            : base.ownerType,
          organisationName: storedString(source.organisationName),
          organisationIdentityNumber: storedString(source.organisationIdentityNumber),
          fullName: storedString(source.fullName),
          identityNumber: storedString(source.identityNumber),
          dateOfBirth: storedString(source.dateOfBirth),
          gender: source.gender === "NAM" || source.gender === "NU" ? source.gender : base.gender,
          residenceAddress: storedString(source.residenceAddress),
          identitySource:
            source.identitySource === "QR" || source.identitySource === "MANUAL"
              ? source.identitySource
              : base.identitySource,
          qrPayloadHash: storedString(source.qrPayloadHash),
          qrDecoderVersion: storedString(source.qrDecoderVersion),
          qrParserVersion: storedString(source.qrParserVersion),
          identityStatus:
            source.identityStatus === "PENDING_CONFIRMATION" ||
            source.identityStatus === "QR_CONFIRMED" ||
            source.identityStatus === "QR_OVERRIDE_PENDING_REVIEW" ||
            source.identityStatus === "MANUAL_COMPLETE"
              ? source.identityStatus
              : base.identityStatus,
          identityConfirmedAt: storedString(source.identityConfirmedAt),
          identityOverrideReason: storedString(source.identityOverrideReason),
          roleOnCertificate: storedString(source.roleOnCertificate),
          hasDistinctCurrentUser:
            typeof source.hasDistinctCurrentUser === "boolean"
              ? source.hasDistinctCurrentUser
              : false,
          currentUserName: storedString(source.currentUserName),
          currentUserCitizenId: storedString(source.currentUserCitizenId),
          currentUserAddress: storedString(source.currentUserAddress),
          changeReason: storedString(source.changeReason),
        } satisfies Owner;
        return [migrateLegacyOrganisationOwner(owner)];
      })
    : [];
  const parcels = Array.isArray(root.parcels)
    ? root.parcels.flatMap((rawParcel, parcelIndex) => {
        const source = recordOf(rawParcel);
        if (!source) return [];
        const parcelId = storedString(source.id) || `legacy_parcel_${parcelIndex}`;
        const landUses = Array.isArray(source.landUses)
          ? source.landUses.flatMap((rawLandUse, landUseIndex) => {
              const item = recordOf(rawLandUse);
              if (!item) return [];
              return [
                {
                  ...emptyLandUse(
                    storedString(item.id) || `legacy_landuse_${parcelIndex}_${landUseIndex}`,
                  ),
                  purposeCode: storedString(item.purposeCode),
                  purposeFreeText: storedString(item.purposeFreeText),
                  originCode: storedString(item.originCode),
                  formCode: storedString(item.formCode),
                  termCode: storedString(item.termCode),
                  area: storedString(item.area),
                },
              ];
            })
          : [];
        return [
          {
            ...emptyParcel(parcelId, landUses[0]?.id ?? `legacy_landuse_${parcelIndex}_0`),
            parcelIdCode: storedString(source.parcelIdCode),
            mapSheetNumber: storedString(source.mapSheetNumber),
            parcelNumber: storedString(source.parcelNumber),
            addressOnCertificate: storedString(source.addressOnCertificate),
            addressTwoLevel: storedString(source.addressTwoLevel),
            oldWard: storedString(source.oldWard),
            cadastralMapSheetNumber: storedString(source.cadastralMapSheetNumber),
            cadastralMapSheetOverrideReason: storedString(source.cadastralMapSheetOverrideReason),
            cadastralParcelNumber: storedString(source.cadastralParcelNumber),
            area: storedString(source.area),
            landUses:
              landUses.length > 0 ? landUses : [emptyLandUse(`legacy_landuse_${parcelIndex}_0`)],
          },
        ];
      })
    : [];
  const assets = Array.isArray(root.assets)
    ? root.assets.flatMap((rawAsset, index) => {
        const source = recordOf(rawAsset);
        if (!source) return [];
        return [
          {
            ...emptyAsset(storedString(source.id) || `legacy_asset_${index}`),
            parcelId: storedString(source.parcelId),
            assetType: storedString(source.assetType),
            description: storedString(source.description),
            mixedUseBuildingName: storedString(source.mixedUseBuildingName),
            apartmentBuildingName: storedString(source.apartmentBuildingName),
            apartmentNumber: storedString(source.apartmentNumber),
            constructionArea: storedString(source.constructionArea),
            floorArea: storedString(source.floorArea),
            ownershipForm: storedString(source.ownershipForm),
            ownershipTerm: storedString(source.ownershipTerm),
            grade: storedString(source.grade),
          },
        ];
      })
    : [];
  const metadata = Array.isArray(root.certificateFileMetadata)
    ? root.certificateFileMetadata.flatMap((rawItem) => {
        const item = recordOf(rawItem);
        return item && storedString(item.fileId)
          ? [{ fileId: storedString(item.fileId), pageLabel: storedString(item.pageLabel) }]
          : [];
      })
    : [];
  return {
    certificate: {
      issueNumber: storedString(certificate.issueNumber),
      issueDate: storedString(certificate.issueDate),
      registryNumber: storedString(certificate.registryNumber),
    },
    owners,
    parcels,
    assets,
    certificateFileMetadata: metadata,
    wardAdministrativeCodeOverride: storedString(root.wardAdministrativeCodeOverride),
    wardAdministrativeCodeOverrideReason: storedString(root.wardAdministrativeCodeOverrideReason),
    scannedFileNamesOverride: storedString(root.scannedFileNamesOverride),
    scannedFileNamesOverrideReason: storedString(root.scannedFileNamesOverrideReason),
    phone: storedString(root.phone),
    consentAccepted: root.consentAccepted === true,
  };
}

export type GcnV2RuntimeMetadataIssue =
  | "SCHEMA_VERSION_MISMATCH"
  | "PROMPT_VERSION_MISMATCH"
  | "MODEL_MISMATCH"
  | "SOURCE_HASH_MISMATCH"
  | "PAGE_COUNT_MISMATCH"
  | "PAGE_FILE_NOT_IN_MANIFEST"
  | "MANIFEST_FILE_NOT_PROCESSED"
  | "EVIDENCE_FILE_NOT_IN_MANIFEST";

/**
 * Metadata do model trả về không phải nguồn tin cậy. Hai đường nhận kết quả gọi hàm này với dữ
 * liệu job/manifest phía server trước khi lưu JSON.
 */
export function validateGcnV2RuntimeMetadata(input: {
  payload: GcnExtractionPayloadV2;
  expectedSchemaVersion: string;
  expectedPromptVersion: string;
  expectedModelIdentifier: string;
  expectedSourceHash: string;
  allowedFileIds: ReadonlySet<string>;
}): GcnV2RuntimeMetadataIssue[] {
  const issues = new Set<GcnV2RuntimeMetadataIssue>();
  const metadata = input.payload.metadata;
  if (metadata.schemaVersion !== input.expectedSchemaVersion) {
    issues.add("SCHEMA_VERSION_MISMATCH");
  }
  if (metadata.promptVersion !== input.expectedPromptVersion) {
    issues.add("PROMPT_VERSION_MISMATCH");
  }
  if (metadata.modelIdentifier !== input.expectedModelIdentifier) issues.add("MODEL_MISMATCH");
  if (metadata.sourceDocumentHash !== input.expectedSourceHash) {
    issues.add("SOURCE_HASH_MISMATCH");
  }
  if (metadata.pagesProcessed !== input.payload.pages.length) issues.add("PAGE_COUNT_MISMATCH");
  if (input.payload.pages.some((page) => !input.allowedFileIds.has(page.fileId))) {
    issues.add("PAGE_FILE_NOT_IN_MANIFEST");
  }
  const processedFileIds = new Set(input.payload.pages.map((page) => page.fileId));
  if ([...input.allowedFileIds].some((fileId) => !processedFileIds.has(fileId))) {
    issues.add("MANIFEST_FILE_NOT_PROCESSED");
  }
  if (input.payload.evidence.some((evidence) => !input.allowedFileIds.has(evidence.fileId))) {
    issues.add("EVIDENCE_FILE_NOT_IN_MANIFEST");
  }
  return [...issues];
}

/** Hình dạng tối thiểu của leaf do parser GCN v2 cung cấp cho lớp repository. */
export interface GcnV2LeafSuggestion {
  readonly templatePath: string;
  readonly destinationPath: string;
  readonly stableKey?: string;
  /** Nhãn thứ tự an toàn cho officer UI, được suy ra từ payload đã validate chứ không lộ ID nội bộ. */
  readonly entityLabel?: string;
  readonly value: string | null;
  readonly sourceValue: string | null;
  readonly fieldStatus: PersistedAiFieldStatus;
  readonly evidence: unknown;
}

const EVIDENCE_STATUS_PRIORITY: Readonly<Record<GcnEvidenceStatus, number>> = {
  CONFLICT: 5,
  LOW_CONFIDENCE: 4,
  EXTRACTED: 3,
  UNREADABLE: 2,
  NOT_FOUND: 1,
};

/** Chuyển payload đã validate thành leaf comparison; không đọc đường dẫn do client cung cấp. */
export function buildGcnV2LeafSuggestions(
  payload: GcnExtractionPayloadV2,
  sourceImageOrdinals: ReadonlyMap<string, number> = new Map(),
): GcnV2LeafSuggestion[] {
  return buildGcnV2FieldComparisons(payload).map((comparison) => {
    const entityLabel = entityLabelForSourcePath(payload, comparison.destinationPath);
    const entries = comparison.evidence.entries
      .map((entry) => ({
        ...entry,
        sourceImageOrdinal: sourceImageOrdinals.get(entry.fileId) ?? null,
      }))
      .sort(
        (left, right) =>
          EVIDENCE_STATUS_PRIORITY[right.status] - EVIDENCE_STATUS_PRIORITY[left.status],
      );
    const first = entries[0];
    // Raw span có thể khác nhau ("Số thửa: 012" và "012") nhưng cùng normalized value. Chỉ
    // merger/evidence được phép khai CONFLICT; backend không suy conflict từ chữ nguồn.
    const aggregateStatus: GcnEvidenceStatus = first?.status ?? "NOT_FOUND";
    const evidence = first
      ? {
          ...first,
          status: aggregateStatus,
          ...(entries.length > 1 ? { alternatives: entries } : {}),
        }
      : {
          fieldPath: comparison.destinationPath,
          rawText: null,
          fileId: "",
          pageNumber: null,
          confidence: null,
          status: "NOT_FOUND" as const,
        };
    return {
      templatePath: comparison.templatePath,
      destinationPath: comparison.destinationPath,
      ...(comparison.stableKey ? { stableKey: comparison.stableKey } : {}),
      ...(entityLabel ? { entityLabel } : {}),
      value: aggregateStatus === "CONFLICT" ? null : comparison.aiValue,
      sourceValue: comparison.sourceValue,
      fieldStatus:
        aggregateStatus === "EXTRACTED"
          ? "CLEAR"
          : aggregateStatus === "LOW_CONFIDENCE" || aggregateStatus === "CONFLICT"
            ? "CHECK"
            : "MANUAL_REQUIRED",
      evidence,
    };
  });
}

export interface GcnV2BackendComparison {
  readonly fieldPath: string;
  readonly templatePath: string;
  readonly currentValue: string;
  readonly aiValue: string | null;
  readonly sourceValue: string | null;
  readonly fieldStatus: PersistedAiFieldStatus;
  readonly evidence: unknown;
  readonly provenance: GcnFieldProvenance;
  readonly applyable: boolean;
  readonly canApply: boolean;
  readonly stableKey?: string;
  readonly entityLabel?: string;
  /** Chỉ dùng trong server để nối asset mới vào đúng thửa; UI không được quyết định giá trị này. */
  readonly targetParcelId?: string;
}

interface DestinationPlan {
  readonly ownerIds: ReadonlyMap<string, string>;
  /** Row rỗng của UI có ownerType mặc định CA_NHAN; đây không phải dữ liệu người dùng. */
  readonly blankOwnerIds: ReadonlySet<string>;
  readonly parcelIds: ReadonlyMap<string, string>;
  readonly landUseIds: ReadonlyMap<string, string>;
  readonly assetIds: ReadonlyMap<string, string>;
  readonly assetParcelIds: ReadonlyMap<string, string>;
  readonly conflictPrefixes: ReadonlySet<string>;
}

const OWNER_PATH = /^owners\[([^\]]+)]\.([A-Za-z][A-Za-z0-9]*)$/;
const PARCEL_PATH = /^parcels\[([^\]]+)]\.([A-Za-z][A-Za-z0-9]*)$/;
const LAND_USE_PATH = /^parcels\[([^\]]+)]\.landUses\[([^\]]+)]\.([A-Za-z][A-Za-z0-9]*)$/;
const ASSET_PATH = /^assets\[([^\]]+)]\.([A-Za-z][A-Za-z0-9]*)$/;

const CONFIRMED_IDENTITY_FIELDS = new Set(["fullName", "dateOfBirth", "gender"]);

function deterministicId(kind: "owner" | "parcel" | "landuse" | "asset", stableKey: string) {
  const digest = createHash("sha256")
    .update(`gcn-v2:${kind}:${stableKey}`)
    .digest("hex")
    .slice(0, 24);
  return `${kind}_ai_${digest}`;
}

function normalizedBusinessText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

function isBlankOwner(owner: Owner): boolean {
  return ![
    owner.organisationName,
    owner.organisationIdentityNumber,
    owner.fullName,
    owner.identityNumber,
    owner.dateOfBirth,
    owner.gender,
    owner.residenceAddress,
    owner.roleOnCertificate,
  ].some((value) => value?.trim());
}

/** `emptyOwner` dùng CA_NHAN làm default UI; bất kỳ ownerType khác đều là dữ liệu có chủ đích. */
function isPlaceholderOwner(owner: Owner): boolean {
  return owner.ownerType === "CA_NHAN" && isBlankOwner(owner);
}

function isBlankLandUse(landUse: LandUse): boolean {
  return ![
    landUse.purposeCode,
    landUse.purposeFreeText,
    landUse.originCode,
    landUse.formCode,
    landUse.termCode,
    landUse.area,
  ].some((value) => value.trim());
}

function isBlankParcel(parcel: Parcel): boolean {
  return (
    ![
      parcel.parcelIdCode,
      parcel.mapSheetNumber,
      parcel.parcelNumber,
      parcel.addressOnCertificate,
      parcel.addressTwoLevel,
      parcel.oldWard,
      parcel.cadastralMapSheetNumber,
      parcel.cadastralParcelNumber,
      parcel.area,
    ].some((value) => value?.trim()) && parcel.landUses.every(isBlankLandUse)
  );
}

function ownerBusinessKey(owner: {
  ownerType: string | null;
  organisationName: string | null;
  fullName: string | null;
}): string {
  const primary =
    owner.ownerType === "TO_CHUC" || owner.ownerType === "CONG_DONG_DAN_CU"
      ? owner.organisationName
      : owner.fullName;
  return normalizedBusinessText(primary);
}

function currentOwnerBusinessKeys(owner: Owner): string[] {
  return [owner.fullName, owner.organisationName]
    .map(normalizedBusinessText)
    .filter((value, index, values) => value && values.indexOf(value) === index);
}

function parcelBusinessKey(parcel: {
  mapSheetNumber: string | null;
  parcelNumber: string | null;
}): string {
  const map = normalizedBusinessText(parcel.mapSheetNumber);
  const number = normalizedBusinessText(parcel.parcelNumber);
  return map && number ? `${map}\u0000${number}` : "";
}

function currentParcelBusinessKey(parcel: Parcel): string {
  return parcelBusinessKey(parcel);
}

function landUseBusinessKey(landUse: {
  purposeCode: string | null;
  purposeFreeText: string | null;
}): string {
  const code = normalizedBusinessText(landUse.purposeCode);
  const freeText = normalizedBusinessText(landUse.purposeFreeText);
  return code || freeText ? `${code}\u0000${freeText}` : "";
}

function currentLandUseBusinessKey(landUse: LandUse): string {
  return landUseBusinessKey(landUse);
}

/**
 * Số dòng mục đích thửa đích sẽ có sau khi nạp. `ensureLandUse` chèn dòng mới vào ô trống nếu còn,
 * hết ô trống mới push, nên phải đếm trên dòng thực tế của thửa — đếm theo số dòng AI ánh xạ sẽ bỏ
 * sót các dòng cán bộ/người dân đã khai và cho phép vượt giới hạn ba mục đích của PL3.
 */
function projectedLandUseCount(
  currentLandUses: readonly LandUse[],
  plannedIds: ReadonlySet<string>,
): number {
  const existingIds = new Set(currentLandUses.map((landUse) => landUse.id));
  const addedRows = [...plannedIds].filter((id) => !existingIds.has(id)).length;
  const freeBlankRows = currentLandUses.filter(
    (landUse) => isBlankLandUse(landUse) && !plannedIds.has(landUse.id),
  ).length;
  return currentLandUses.length + Math.max(0, addedRows - freeBlankRows);
}

function assetBusinessKey(asset: {
  assetType: string | null;
  description: string | null;
  apartmentNumber?: string | null;
}): string {
  const type = normalizedBusinessText(asset.assetType);
  const discriminator = normalizedBusinessText(asset.apartmentNumber || asset.description);
  return type || discriminator ? `${type}\u0000${discriminator}` : "";
}

function currentAssetBusinessKey(asset: Asset): string {
  return assetBusinessKey(asset);
}

function buildDestinationPlan(
  current: IntakeDraft,
  payload: GcnExtractionPayloadV2,
): DestinationPlan {
  const ownerIds = new Map<string, string>();
  const parcelIds = new Map<string, string>();
  const landUseIds = new Map<string, string>();
  const assetIds = new Map<string, string>();
  const assetParcelIds = new Map<string, string>();
  const conflictPrefixes = new Set<string>();
  const usedOwnerIds = new Set<string>();
  const blankOwnerIds = new Set<string>();
  const usedParcelIds = new Set<string>();
  const usedAssetIds = new Set<string>();

  for (const aiOwner of payload.data.owners) {
    const deterministic = deterministicId("owner", aiOwner.stableKey);
    const deterministicMatch = current.owners.find((owner) => owner.id === deterministic);
    if (deterministicMatch) {
      ownerIds.set(aiOwner.stableKey, deterministicMatch.id);
      usedOwnerIds.add(deterministicMatch.id);
      continue;
    }
    const key = ownerBusinessKey(aiOwner);
    const matches = key
      ? current.owners.filter(
          (owner) => !usedOwnerIds.has(owner.id) && currentOwnerBusinessKeys(owner).includes(key),
        )
      : [];
    if (matches.length > 1) {
      conflictPrefixes.add(`owners[${aiOwner.stableKey}]`);
      continue;
    }
    const blank = current.owners.find(
      (owner) => !usedOwnerIds.has(owner.id) && isPlaceholderOwner(owner),
    );
    const destinationId = matches[0]?.id ?? blank?.id ?? deterministic;
    ownerIds.set(aiOwner.stableKey, destinationId);
    if (blank?.id === destinationId) blankOwnerIds.add(destinationId);
    usedOwnerIds.add(destinationId);
  }

  for (const aiParcel of payload.data.parcels) {
    const deterministic = deterministicId("parcel", aiParcel.stableKey);
    const deterministicMatch = current.parcels.find((parcel) => parcel.id === deterministic);
    if (deterministicMatch) {
      parcelIds.set(aiParcel.stableKey, deterministicMatch.id);
      usedParcelIds.add(deterministicMatch.id);
      continue;
    }
    const key = parcelBusinessKey(aiParcel);
    const matches = key
      ? current.parcels.filter(
          (parcel) => !usedParcelIds.has(parcel.id) && currentParcelBusinessKey(parcel) === key,
        )
      : [];
    if (matches.length > 1) {
      conflictPrefixes.add(`parcels[${aiParcel.stableKey}]`);
      continue;
    }
    const blank = current.parcels.find(
      (parcel) => !usedParcelIds.has(parcel.id) && isBlankParcel(parcel),
    );
    const destinationId = matches[0]?.id ?? blank?.id ?? deterministic;
    parcelIds.set(aiParcel.stableKey, destinationId);
    usedParcelIds.add(destinationId);
  }

  for (const aiParcel of payload.data.parcels) {
    const parcelId = parcelIds.get(aiParcel.stableKey);
    if (!parcelId) continue;
    const currentParcel = current.parcels.find((parcel) => parcel.id === parcelId);
    const currentLandUses = currentParcel?.landUses ?? [];
    const usedLandUseIds = new Set<string>();
    for (const aiLandUse of aiParcel.landUses) {
      const compositeStableKey = `${aiParcel.stableKey}:${aiLandUse.stableKey}`;
      const deterministic = deterministicId("landuse", compositeStableKey);
      const deterministicMatch = currentLandUses.find((landUse) => landUse.id === deterministic);
      if (deterministicMatch) {
        landUseIds.set(compositeStableKey, deterministicMatch.id);
        usedLandUseIds.add(deterministicMatch.id);
        continue;
      }
      const key = landUseBusinessKey(aiLandUse);
      const matches = key
        ? currentLandUses.filter(
            (landUse) =>
              !usedLandUseIds.has(landUse.id) && currentLandUseBusinessKey(landUse) === key,
          )
        : [];
      if (matches.length > 1) {
        conflictPrefixes.add(`parcels[${aiParcel.stableKey}].landUses[${aiLandUse.stableKey}]`);
        continue;
      }
      const blank = currentLandUses.find(
        (landUse) => !usedLandUseIds.has(landUse.id) && isBlankLandUse(landUse),
      );
      const destinationId = matches[0]?.id ?? blank?.id ?? deterministic;
      const projectedCount = projectedLandUseCount(
        currentLandUses,
        new Set([...usedLandUseIds, destinationId]),
      );
      if (projectedCount > MAX_LAND_USES_PER_PARCEL) {
        conflictPrefixes.add(`parcels[${aiParcel.stableKey}].landUses[${aiLandUse.stableKey}]`);
        continue;
      }
      landUseIds.set(compositeStableKey, destinationId);
      usedLandUseIds.add(destinationId);
    }
  }

  for (const aiAsset of payload.data.assets) {
    let parcelId = aiAsset.parcelStableKey
      ? parcelIds.get(aiAsset.parcelStableKey)
      : payload.data.parcels.length === 1
        ? parcelIds.get(payload.data.parcels[0].stableKey)
        : undefined;
    if (!parcelId && current.parcels.length === 1 && payload.data.parcels.length === 0) {
      parcelId = current.parcels[0].id;
    }
    if (!parcelId) {
      conflictPrefixes.add(`assets[${aiAsset.stableKey}]`);
      continue;
    }
    assetParcelIds.set(aiAsset.stableKey, parcelId);
    const deterministic = deterministicId("asset", aiAsset.stableKey);
    const deterministicMatch = current.assets.find(
      (asset) => asset.id === deterministic && !usedAssetIds.has(asset.id),
    );
    if (deterministicMatch) {
      assetIds.set(aiAsset.stableKey, deterministicMatch.id);
      usedAssetIds.add(deterministicMatch.id);
      continue;
    }
    const key = assetBusinessKey(aiAsset);
    const matches = key
      ? current.assets.filter(
          (asset) =>
            !usedAssetIds.has(asset.id) &&
            (asset.parcelId ?? "") === parcelId &&
            currentAssetBusinessKey(asset) === key,
        )
      : [];
    if (matches.length > 1) {
      conflictPrefixes.add(`assets[${aiAsset.stableKey}]`);
      continue;
    }
    const destinationId = matches[0]?.id ?? deterministic;
    assetIds.set(aiAsset.stableKey, destinationId);
    usedAssetIds.add(destinationId);
  }

  return {
    ownerIds,
    blankOwnerIds,
    parcelIds,
    landUseIds,
    assetIds,
    assetParcelIds,
    conflictPrefixes,
  };
}

function remapDestinationPath(path: string, plan: DestinationPlan): string | null {
  const landUse = LAND_USE_PATH.exec(path);
  if (landUse) {
    const parcelId = plan.parcelIds.get(landUse[1]);
    const landUseId = plan.landUseIds.get(`${landUse[1]}:${landUse[2]}`);
    return parcelId && landUseId
      ? `parcels[${parcelId}].landUses[${landUseId}].${landUse[3]}`
      : null;
  }
  const owner = OWNER_PATH.exec(path);
  if (owner) {
    const ownerId = plan.ownerIds.get(owner[1]);
    return ownerId ? `owners[${ownerId}].${owner[2]}` : null;
  }
  const parcel = PARCEL_PATH.exec(path);
  if (parcel) {
    const parcelId = plan.parcelIds.get(parcel[1]);
    return parcelId ? `parcels[${parcelId}].${parcel[2]}` : null;
  }
  const asset = ASSET_PATH.exec(path);
  if (asset) {
    const assetId = plan.assetIds.get(asset[1]);
    return assetId ? `assets[${assetId}].${asset[2]}` : null;
  }
  return path.startsWith("certificate.") || path.startsWith("registeredChanges[") ? path : null;
}

function isConflictingSourcePath(path: string, plan: DestinationPlan): boolean {
  for (const prefix of plan.conflictPrefixes) {
    if (path === prefix || path.startsWith(`${prefix}.`)) return true;
  }
  return false;
}

function pathValue(draft: IntakeDraft | null | undefined, path: string): string {
  if (!draft) return "";
  if (path.startsWith("certificate.")) {
    const key = path.slice("certificate.".length) as keyof IntakeDraft["certificate"];
    const value = draft.certificate[key];
    return typeof value === "string" ? value : "";
  }
  const landUse = LAND_USE_PATH.exec(path);
  if (landUse) {
    const value = draft.parcels
      .find((parcel) => parcel.id === landUse[1])
      ?.landUses.find((entry) => entry.id === landUse[2])?.[landUse[3] as keyof LandUse];
    return typeof value === "string" ? value : "";
  }
  const owner = OWNER_PATH.exec(path);
  if (owner) {
    const value = draft.owners.find((entry) => entry.id === owner[1])?.[owner[2] as keyof Owner];
    return typeof value === "string" ? value : "";
  }
  const parcel = PARCEL_PATH.exec(path);
  if (parcel) {
    const value = draft.parcels.find((entry) => entry.id === parcel[1])?.[
      parcel[2] as keyof Parcel
    ];
    return typeof value === "string" ? value : "";
  }
  const asset = ASSET_PATH.exec(path);
  if (asset) {
    const value = draft.assets.find((entry) => entry.id === asset[1])?.[asset[2] as keyof Asset];
    return typeof value === "string" ? value : "";
  }
  return "";
}

function plannedPathValue(
  draft: IntakeDraft | null | undefined,
  path: string,
  blankOwnerIds: ReadonlySet<string>,
): string {
  const owner = OWNER_PATH.exec(path);
  if (owner?.[2] === "ownerType" && blankOwnerIds.has(owner[1])) {
    const entry = draft?.owners.find((item) => item.id === owner[1]);
    if (entry && isPlaceholderOwner(entry)) return "";
  }
  return pathValue(draft, path);
}

function evidenceStatus(evidence: unknown): GcnEvidenceStatus | null {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const status = (evidence as Record<string, unknown>).status;
  return status === "EXTRACTED" ||
    status === "LOW_CONFIDENCE" ||
    status === "UNREADABLE" ||
    status === "CONFLICT" ||
    status === "NOT_FOUND"
    ? status
    : null;
}

function isConfirmedIdentityPath(current: IntakeDraft, path: string): boolean {
  const match = OWNER_PATH.exec(path);
  if (!match || !CONFIRMED_IDENTITY_FIELDS.has(match[2])) return false;
  const owner = current.owners.find((entry) => entry.id === match[1]);
  return owner?.identityStatus === "QR_CONFIRMED" || owner?.identityStatus === "MANUAL_COMPLETE";
}

function comparable(value: string | null | undefined): string {
  return (value ?? "").normalize("NFC").trim();
}

function provenanceFor(input: {
  current: IntakeDraft;
  destinationPath: string;
  currentValue: string;
  citizenValue: string;
  aiValue: string | null;
  status: GcnEvidenceStatus | null;
  priorAppliedValues: ReadonlyMap<string, string>;
  mappingConflict: boolean;
}): GcnFieldProvenance {
  if (input.mappingConflict || input.status === "CONFLICT" || input.status === "LOW_CONFIDENCE") {
    return "CONFLICT";
  }
  if (input.status === "UNREADABLE" || input.status === "NOT_FOUND") return "UNREADABLE";
  const currentValue = comparable(input.currentValue);
  const citizenValue = comparable(input.citizenValue);
  if (isConfirmedIdentityPath(input.current, input.destinationPath)) return "OFFICER_CONFIRMED";
  if (currentValue) {
    if (citizenValue && currentValue === citizenValue) return "CITIZEN_PROVIDED";
    const prior = comparable(input.priorAppliedValues.get(input.destinationPath));
    if (prior && currentValue === prior) return "AI_PROPOSED";
    return "OFFICER_EDITED";
  }
  return citizenValue ? "OFFICER_EDITED" : "EMPTY";
}

function contractAllowsApply(templatePath: string): boolean {
  return (
    GCN_V2_FIELD_CONTRACT.find((entry) => entry.path === templatePath)?.aiApply ===
    "EMPTY_OR_AI_PROPOSED"
  );
}

export function buildGcnV2BackendComparisons(input: {
  current: IntakeDraft;
  citizen?: IntakeDraft | null;
  payload: GcnExtractionPayloadV2;
  suggestions: readonly GcnV2LeafSuggestion[];
  priorAppliedValues?: ReadonlyMap<string, string>;
}): GcnV2BackendComparison[] {
  const plan = buildDestinationPlan(input.current, input.payload);
  const priorAppliedValues = input.priorAppliedValues ?? new Map<string, string>();
  return input.suggestions.map((suggestion) => {
    const mappingConflict = isConflictingSourcePath(suggestion.destinationPath, plan);
    const destinationPath = remapDestinationPath(suggestion.destinationPath, plan);
    const fieldPath = destinationPath ?? suggestion.destinationPath;
    const currentValue = destinationPath
      ? plannedPathValue(input.current, destinationPath, plan.blankOwnerIds)
      : "";
    const citizenValue = destinationPath
      ? plannedPathValue(input.citizen, destinationPath, plan.blankOwnerIds)
      : "";
    const status = evidenceStatus(suggestion.evidence);
    const provenance = provenanceFor({
      current: input.current,
      destinationPath: fieldPath,
      currentValue,
      citizenValue,
      aiValue: suggestion.value,
      status,
      priorAppliedValues,
      mappingConflict: mappingConflict || !destinationPath,
    });
    const applyable =
      !!destinationPath &&
      status === "EXTRACTED" &&
      suggestion.fieldStatus === "CLEAR" &&
      !!comparable(suggestion.value) &&
      contractAllowsApply(suggestion.templatePath) &&
      (provenance === "EMPTY" || provenance === "AI_PROPOSED") &&
      comparable(currentValue) !== comparable(suggestion.value);
    const asset = ASSET_PATH.exec(suggestion.destinationPath);
    const targetParcelId = asset ? plan.assetParcelIds.get(asset[1]) : undefined;
    return {
      fieldPath,
      templatePath: suggestion.templatePath,
      currentValue,
      aiValue: suggestion.value,
      sourceValue: comparable(citizenValue) ? citizenValue : null,
      fieldStatus: mappingConflict || !destinationPath ? "CHECK" : suggestion.fieldStatus,
      evidence: suggestion.evidence,
      provenance,
      applyable,
      canApply: applyable,
      ...(suggestion.stableKey ? { stableKey: suggestion.stableKey } : {}),
      ...(suggestion.entityLabel ? { entityLabel: suggestion.entityLabel } : {}),
      ...(targetParcelId ? { targetParcelId } : {}),
    };
  });
}

function entityLabelForSourcePath(payload: GcnExtractionPayloadV2, path: string): string | null {
  const owner = OWNER_PATH.exec(path);
  if (owner) {
    const index = payload.data.owners.findIndex((item) => item.stableKey === owner[1]);
    return index >= 0 ? `Chủ ${index + 1}` : null;
  }
  const landUse = LAND_USE_PATH.exec(path);
  if (landUse) {
    const parcelIndex = payload.data.parcels.findIndex((item) => item.stableKey === landUse[1]);
    const useIndex = payload.data.parcels[parcelIndex]?.landUses.findIndex(
      (item) => item.stableKey === landUse[2],
    );
    return parcelIndex >= 0 && typeof useIndex === "number" && useIndex >= 0
      ? `Thửa ${parcelIndex + 1} · Mục đích ${useIndex + 1}`
      : null;
  }
  const parcel = PARCEL_PATH.exec(path);
  if (parcel) {
    const index = payload.data.parcels.findIndex((item) => item.stableKey === parcel[1]);
    return index >= 0 ? `Thửa ${index + 1}` : null;
  }
  const asset = ASSET_PATH.exec(path);
  if (asset) {
    const assetIndex = payload.data.assets.findIndex((item) => item.stableKey === asset[1]);
    const parcelIndex = payload.data.parcels.findIndex(
      (item) => item.stableKey === payload.data.assets[assetIndex]?.parcelStableKey,
    );
    if (assetIndex < 0) return null;
    return parcelIndex >= 0
      ? `Thửa ${parcelIndex + 1} · Tài sản ${assetIndex + 1}`
      : `Tài sản ${assetIndex + 1}`;
  }
  const change = /^registeredChanges\[([^\]]+)]\./.exec(path);
  if (change) {
    const index = payload.data.registeredChanges.findIndex((item) => item.stableKey === change[1]);
    return index >= 0 ? `Biến động ${index + 1}` : null;
  }
  return null;
}

function ensureOwner(draft: IntakeDraft, ownerId: string): Owner {
  let owner = draft.owners.find((entry) => entry.id === ownerId);
  if (!owner) {
    owner = emptyOwner(ownerId);
    draft.owners.push(owner);
  }
  return owner;
}

function ensureParcel(draft: IntakeDraft, parcelId: string): Parcel {
  let parcel = draft.parcels.find((entry) => entry.id === parcelId);
  if (!parcel) {
    parcel = emptyParcel(parcelId, deterministicId("landuse", `${parcelId}:placeholder`));
    draft.parcels.push(parcel);
  }
  return parcel;
}

function ensureLandUse(parcel: Parcel, landUseId: string): LandUse {
  let landUse = parcel.landUses.find((entry) => entry.id === landUseId);
  if (!landUse) {
    const blankIndex = parcel.landUses.findIndex(isBlankLandUse);
    landUse = emptyLandUse(landUseId);
    if (blankIndex >= 0) parcel.landUses.splice(blankIndex, 1, landUse);
    else parcel.landUses.push(landUse);
  }
  return landUse;
}

function ensureAsset(draft: IntakeDraft, assetId: string, parcelId: string): Asset {
  let asset = draft.assets.find((entry) => entry.id === assetId);
  if (!asset) {
    asset = emptyAsset(assetId, parcelId);
    draft.assets.push(asset);
  }
  return asset;
}

function setDestinationValue(
  draft: IntakeDraft,
  comparison: GcnV2BackendComparison,
  value: string,
): boolean {
  if (comparison.fieldPath.startsWith("certificate.")) {
    const key = comparison.fieldPath.slice(
      "certificate.".length,
    ) as keyof IntakeDraft["certificate"];
    if (key !== "issueNumber" && key !== "issueDate" && key !== "registryNumber") return false;
    draft.certificate[key] = value;
    return true;
  }
  const landUse = LAND_USE_PATH.exec(comparison.fieldPath);
  if (landUse) {
    const parcel = ensureParcel(draft, landUse[1]);
    const entry = ensureLandUse(parcel, landUse[2]);
    const key = landUse[3] as keyof LandUse;
    if (
      key !== "purposeCode" &&
      key !== "purposeFreeText" &&
      key !== "originCode" &&
      key !== "formCode" &&
      key !== "termCode" &&
      key !== "area"
    ) {
      return false;
    }
    entry[key] = value;
    return true;
  }
  const owner = OWNER_PATH.exec(comparison.fieldPath);
  if (owner) {
    const entry = ensureOwner(draft, owner[1]);
    const key = owner[2] as keyof Owner;
    if (key === "ownerType") entry.ownerType = value as Owner["ownerType"];
    else if (key === "gender") entry.gender = value as Owner["gender"];
    else if (
      key === "organisationName" ||
      key === "organisationIdentityNumber" ||
      key === "fullName" ||
      key === "dateOfBirth" ||
      key === "residenceAddress" ||
      key === "roleOnCertificate"
    ) {
      entry[key] = value;
    } else return false;
    return true;
  }
  const parcel = PARCEL_PATH.exec(comparison.fieldPath);
  if (parcel) {
    const entry = ensureParcel(draft, parcel[1]);
    const key = parcel[2] as keyof Parcel;
    if (
      key !== "parcelIdCode" &&
      key !== "mapSheetNumber" &&
      key !== "parcelNumber" &&
      key !== "addressOnCertificate" &&
      key !== "oldWard" &&
      key !== "area"
    ) {
      return false;
    }
    entry[key] = value;
    return true;
  }
  const asset = ASSET_PATH.exec(comparison.fieldPath);
  if (asset) {
    if (!comparison.targetParcelId) return false;
    ensureParcel(draft, comparison.targetParcelId);
    const entry = ensureAsset(draft, asset[1], comparison.targetParcelId);
    const key = asset[2] as keyof Asset;
    if (
      key !== "assetType" &&
      key !== "description" &&
      key !== "mixedUseBuildingName" &&
      key !== "apartmentBuildingName" &&
      key !== "apartmentNumber" &&
      key !== "constructionArea" &&
      key !== "floorArea" &&
      key !== "ownershipForm" &&
      key !== "ownershipTerm" &&
      key !== "grade"
    ) {
      return false;
    }
    entry[key] = value;
    return true;
  }
  return false;
}

export function applyGcnV2BackendComparisons(input: {
  draft: IntakeDraft;
  comparisons: readonly GcnV2BackendComparison[];
  selectedFieldPaths?: readonly string[];
}): {
  readonly draft: IntakeDraft;
  readonly appliedFieldPaths: string[];
  readonly invalidFieldPaths: string[];
} {
  const selected = input.selectedFieldPaths
    ? new Set(input.selectedFieldPaths)
    : new Set(input.comparisons.filter((entry) => entry.applyable).map((entry) => entry.fieldPath));
  const byPath = new Map(input.comparisons.map((entry) => [entry.fieldPath, entry]));
  const invalidFieldPaths = new Set([...selected].filter((path) => !byPath.get(path)?.applyable));
  for (const fieldPath of selected) {
    const owner = OWNER_PATH.exec(fieldPath);
    if (!owner || owner[2] === "ownerType") continue;
    const currentOwner = input.draft.owners.find((entry) => entry.id === owner[1]);
    if (currentOwner && !isPlaceholderOwner(currentOwner)) continue;
    const ownerTypePath = `owners[${owner[1]}].ownerType`;
    const ownerType = byPath.get(ownerTypePath);
    if (!selected.has(ownerTypePath) || !ownerType?.applyable || !ownerType.aiValue) {
      invalidFieldPaths.add(fieldPath);
    }
  }
  if (invalidFieldPaths.size > 0) {
    return {
      draft: input.draft,
      appliedFieldPaths: [],
      invalidFieldPaths: [...invalidFieldPaths].sort(),
    };
  }
  const next = structuredClone(input.draft);
  const appliedFieldPaths: string[] = [];
  const orderedFieldPaths = [...selected].sort((left, right) => {
    const leftOwner = OWNER_PATH.exec(left);
    const rightOwner = OWNER_PATH.exec(right);
    if (leftOwner && rightOwner && leftOwner[1] === rightOwner[1]) {
      if (leftOwner[2] === "ownerType") return -1;
      if (rightOwner[2] === "ownerType") return 1;
    }
    return left.localeCompare(right);
  });
  for (const fieldPath of orderedFieldPaths) {
    const comparison = byPath.get(fieldPath);
    if (!comparison?.applyable || !comparison.aiValue) continue;
    if (setDestinationValue(next, comparison, comparison.aiValue)) {
      appliedFieldPaths.push(fieldPath);
    }
  }
  // `draftSchema` cố tình không mang các luật PL3 (xem `validateWorkingPayloadForSave`), nên đường
  // nạp AI phải gọi thêm cùng bộ luật mà bàn làm việc dùng khi lưu — nếu không, AI ghi được bản
  // payload mà chính cán bộ không lưu lại được.
  if (
    appliedFieldPaths.length > 0 &&
    (!draftSchema.safeParse(next).success || validateWorkingPayloadForSave(next) !== null)
  ) {
    return { draft: input.draft, appliedFieldPaths: [], invalidFieldPaths: appliedFieldPaths };
  }
  return { draft: next, appliedFieldPaths, invalidFieldPaths: [] };
}

/** Metadata mở rộng được đặt trong evidence_json để không cần đổi schema database. */
export function comparisonEvidenceForStorage(comparison: GcnV2BackendComparison): unknown {
  return {
    evidence: comparison.evidence,
    templatePath: comparison.templatePath,
    stableKey: comparison.stableKey ?? null,
    provenance: comparison.provenance,
    applyable: comparison.applyable,
    targetParcelId: comparison.targetParcelId ?? null,
  };
}
