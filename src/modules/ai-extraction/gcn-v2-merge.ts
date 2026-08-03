import type {
  GcnExtractionEvidenceV2,
  GcnExtractionPageV2,
  GcnExtractionPayloadV2,
  GcnV2Asset,
  GcnV2LandUse,
  GcnV2Owner,
  GcnV2Parcel,
  GcnV2RegisteredChange,
} from "./gcn-v2-contract";
import { normalizeGcnExtractionPayloadV2, normalizeGcnText } from "./gcn-v2-normalizer";
import { collectGcnV2FieldObservations, gcnExtractionPayloadV2Schema } from "./gcn-v2-schema";

export interface GcnV2MergeConflict {
  readonly fieldPath: string;
  readonly reason: "VALUE_CONFLICT" | "AMBIGUOUS_ARRAY_MATCH";
}

export interface GcnV2MergeResult {
  readonly payload: GcnExtractionPayloadV2;
  readonly conflicts: readonly GcnV2MergeConflict[];
}

export class GcnV2MergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GcnV2MergeError";
  }
}

/**
 * Ghép kết quả đã chuẩn hóa của từng trang. Hàm không chọn một trong hai giá trị khác nhau: nó
 * xóa value hợp nhất khi hai nguồn đọc được mâu thuẫn. Evidence không đọc được/không tìm thấy vẫn
 * giữ nguyên trạng thái để không biến một nguồn rỗng thành bằng chứng mâu thuẫn giả.
 */
export function mergeGcnV2PageExtractions(
  pagePayloads: readonly GcnExtractionPayloadV2[],
): GcnV2MergeResult {
  if (pagePayloads.length === 0) {
    throw new GcnV2MergeError("Cần ít nhất một kết quả trang để merge GCN v2.");
  }
  const normalizedInputs = pagePayloads.map((payload) =>
    gcnExtractionPayloadV2Schema.parse(normalizeGcnExtractionPayloadV2(payload)),
  );
  const merged = structuredClone(normalizedInputs[0]);
  const conflicts: GcnV2MergeConflict[] = [];
  const valueConflictPaths = new Set<string>();
  const ambiguousPaths = new Set<string>();
  const sourceHashes = new Set<string | null>([merged.metadata.sourceDocumentHash]);

  for (const incoming of normalizedInputs.slice(1)) {
    mergeCertificate(merged, incoming, conflicts, valueConflictPaths);
    mergeOwners(merged, incoming, conflicts, valueConflictPaths);
    mergeParcels(merged, incoming, conflicts, valueConflictPaths);
    mergeAssets(merged, incoming, conflicts, valueConflictPaths);
    mergeRegisteredChanges(merged, incoming, conflicts, valueConflictPaths);
    merged.pages = mergePages(merged.pages, incoming.pages, merged.warnings);
    merged.evidence.push(...structuredClone(incoming.evidence));
    merged.warnings.push(...incoming.warnings);
    sourceHashes.add(incoming.metadata.sourceDocumentHash);
    if (incoming.metadata.modelIdentifier !== merged.metadata.modelIdentifier) {
      throw new GcnV2MergeError(
        "Không thể merge kết quả GCN v2 do các trang được xử lý bởi modelIdentifier khác nhau.",
      );
    }
    if (incoming.metadata.schemaVersion !== merged.metadata.schemaVersion) {
      throw new GcnV2MergeError(
        "Không thể merge kết quả GCN v2 do schemaVersion giữa các trang khác nhau.",
      );
    }
    if (incoming.metadata.promptVersion !== merged.metadata.promptVersion) {
      throw new GcnV2MergeError(
        "Không thể merge kết quả GCN v2 do promptVersion giữa các trang khác nhau.",
      );
    }
    if (incoming.quality.documentType !== merged.quality.documentType) {
      merged.quality.documentType = "UNKNOWN";
      addWarning(merged.warnings, "DOCUMENT_TYPE_CONFLICT");
    }
    merged.quality.imageStatus = worstImageStatus(
      merged.quality.imageStatus,
      incoming.quality.imageStatus,
    );
    merged.quality.note = mergeNotes(merged.quality.note, incoming.quality.note);
    if (Date.parse(incoming.metadata.processedAt) > Date.parse(merged.metadata.processedAt)) {
      merged.metadata.processedAt = incoming.metadata.processedAt;
    }
  }

  assertNoCrossCollectionStableKeyCollision(merged);
  markAmbiguousBusinessMatches(merged, conflicts, ambiguousPaths);
  if (conflicts.length > 0) addWarning(merged.warnings, "MERGE_CONFLICT_REQUIRES_REVIEW");
  nullConflictingValues(merged, valueConflictPaths);
  merged.evidence = deduplicateEvidence(
    merged.evidence.map((evidence) =>
      valueConflictPaths.has(evidence.fieldPath) && evidence.rawText !== null
        ? { ...evidence, status: "CONFLICT" as const }
        : ambiguousPaths.has(evidence.fieldPath) && evidence.rawText !== null
          ? { ...evidence, status: "LOW_CONFIDENCE" as const }
          : evidence,
    ),
  );
  merged.pages = mergePages([], merged.pages, merged.warnings);
  merged.metadata.pagesProcessed = merged.pages.length;
  if (sourceHashes.size > 1) {
    throw new GcnV2MergeError(
      "Không thể merge kết quả GCN v2 do sourceDocumentHash của các trang không đồng nhất.",
    );
  }
  merged.metadata.sourceDocumentHash = [...sourceHashes][0] ?? null;
  merged.warnings = [...new Set(merged.warnings)];
  return { payload: gcnExtractionPayloadV2Schema.parse(merged), conflicts };
}

function mergeCertificate(
  merged: GcnExtractionPayloadV2,
  incoming: GcnExtractionPayloadV2,
  conflicts: GcnV2MergeConflict[],
  conflictPaths: Set<string>,
): void {
  for (const key of ["issueNumber", "issueDate", "registryNumber"] as const) {
    const fieldPath = `certificate.${key}`;
    merged.data.certificate[key] = mergeScalar(
      merged.data.certificate[key],
      incoming.data.certificate[key],
      fieldPath,
      conflicts,
      conflictPaths,
    );
  }
}

function mergeOwners(
  merged: GcnExtractionPayloadV2,
  incoming: GcnExtractionPayloadV2,
  conflicts: GcnV2MergeConflict[],
  conflictPaths: Set<string>,
): void {
  for (const candidate of incoming.data.owners) {
    const current = merged.data.owners.find((item) => item.stableKey === candidate.stableKey);
    if (!current) {
      merged.data.owners.push(structuredClone(candidate));
      continue;
    }
    const prefix = `owners[${current.stableKey}]`;
    for (const key of [
      "ownerType",
      "organisationName",
      "organisationIdentityNumber",
      "fullName",
      "dateOfBirth",
      "gender",
      "residenceAddress",
      "roleOnCertificate",
    ] as const) {
      current[key] = mergeScalar(
        current[key],
        candidate[key],
        `${prefix}.${key}`,
        conflicts,
        conflictPaths,
      );
    }
  }
}

function mergeParcels(
  merged: GcnExtractionPayloadV2,
  incoming: GcnExtractionPayloadV2,
  conflicts: GcnV2MergeConflict[],
  conflictPaths: Set<string>,
): void {
  for (const candidate of incoming.data.parcels) {
    const current = merged.data.parcels.find((item) => item.stableKey === candidate.stableKey);
    if (!current) {
      merged.data.parcels.push(structuredClone(candidate));
      continue;
    }
    const prefix = `parcels[${current.stableKey}]`;
    for (const key of [
      "parcelIdCode",
      "mapSheetNumber",
      "parcelNumber",
      "addressOnCertificate",
      "oldWard",
      "area",
    ] as const) {
      current[key] = mergeScalar(
        current[key],
        candidate[key],
        `${prefix}.${key}`,
        conflicts,
        conflictPaths,
      );
    }
    mergeLandUses(current, candidate, conflicts, conflictPaths);
  }
}

function mergeLandUses(
  currentParcel: GcnV2Parcel,
  incomingParcel: GcnV2Parcel,
  conflicts: GcnV2MergeConflict[],
  conflictPaths: Set<string>,
): void {
  for (const candidate of incomingParcel.landUses) {
    const current = currentParcel.landUses.find((item) => item.stableKey === candidate.stableKey);
    if (!current) {
      currentParcel.landUses.push(structuredClone(candidate));
      continue;
    }
    const prefix = `parcels[${currentParcel.stableKey}].landUses[${current.stableKey}]`;
    for (const key of [
      "purposeCode",
      "purposeFreeText",
      "area",
      "originCode",
      "formCode",
      "termCode",
    ] as const) {
      current[key] = mergeScalar(
        current[key],
        candidate[key],
        `${prefix}.${key}`,
        conflicts,
        conflictPaths,
      );
    }
  }
}

function mergeAssets(
  merged: GcnExtractionPayloadV2,
  incoming: GcnExtractionPayloadV2,
  conflicts: GcnV2MergeConflict[],
  conflictPaths: Set<string>,
): void {
  for (const candidate of incoming.data.assets) {
    const current = merged.data.assets.find((item) => item.stableKey === candidate.stableKey);
    if (!current) {
      merged.data.assets.push(structuredClone(candidate));
      continue;
    }
    const prefix = `assets[${current.stableKey}]`;
    current.parcelStableKey = mergeScalar(
      current.parcelStableKey,
      candidate.parcelStableKey,
      `${prefix}.parcelStableKey`,
      conflicts,
      conflictPaths,
    );
    for (const key of [
      "assetType",
      "description",
      "mixedUseBuildingName",
      "apartmentBuildingName",
      "apartmentNumber",
      "constructionArea",
      "floorArea",
      "ownershipForm",
      "ownershipTerm",
      "grade",
    ] as const) {
      current[key] = mergeScalar(
        current[key],
        candidate[key],
        `${prefix}.${key}`,
        conflicts,
        conflictPaths,
      );
    }
  }
}

function mergeRegisteredChanges(
  merged: GcnExtractionPayloadV2,
  incoming: GcnExtractionPayloadV2,
  conflicts: GcnV2MergeConflict[],
  conflictPaths: Set<string>,
): void {
  for (const candidate of incoming.data.registeredChanges) {
    const current = merged.data.registeredChanges.find(
      (item) => item.stableKey === candidate.stableKey,
    );
    if (!current) {
      merged.data.registeredChanges.push(structuredClone(candidate));
      continue;
    }
    const prefix = `registeredChanges[${current.stableKey}]`;
    for (const key of ["confirmedDate", "content", "confirmedBy"] as const) {
      current[key] = mergeScalar(
        current[key],
        candidate[key],
        `${prefix}.${key}`,
        conflicts,
        conflictPaths,
      );
    }
  }
}

function mergeScalar<T extends string | null>(
  current: T,
  incoming: T,
  fieldPath: string,
  conflicts: GcnV2MergeConflict[],
  conflictPaths: Set<string>,
): T {
  if (current === null) return incoming;
  if (incoming === null || current === incoming) return current;
  recordConflict(fieldPath, "VALUE_CONFLICT", conflicts, conflictPaths);
  return null as T;
}

function recordConflict(
  fieldPath: string,
  reason: GcnV2MergeConflict["reason"],
  conflicts: GcnV2MergeConflict[],
  conflictPaths: Set<string>,
): void {
  conflictPaths.add(fieldPath);
  if (
    !conflicts.some((conflict) => conflict.fieldPath === fieldPath && conflict.reason === reason)
  ) {
    conflicts.push({ fieldPath, reason });
  }
}

function mergePages(
  currentPages: readonly GcnExtractionPageV2[],
  incomingPages: readonly GcnExtractionPageV2[],
  warnings: string[],
): GcnExtractionPageV2[] {
  const pages: GcnExtractionPageV2[] = currentPages.map((page) => structuredClone(page));
  for (const incoming of incomingPages) {
    const existing = pages.find(
      (page) => page.fileId === incoming.fileId && page.pageNumber === incoming.pageNumber,
    );
    if (!existing) {
      pages.push(structuredClone(incoming));
      continue;
    }
    if (
      existing.pageType !== incoming.pageType ||
      existing.rotationDegrees !== incoming.rotationDegrees
    ) {
      addWarning(warnings, `PAGE_METADATA_CONFLICT:${incoming.fileId}:${incoming.pageNumber}`);
    }
    existing.imageStatus = worstImageStatus(existing.imageStatus, incoming.imageStatus);
    existing.ownerStableKeys = [
      ...new Set([...existing.ownerStableKeys, ...incoming.ownerStableKeys]),
    ];
    existing.parcelStableKeys = [
      ...new Set([...existing.parcelStableKeys, ...incoming.parcelStableKeys]),
    ];
    existing.registeredChangeStableKeys = [
      ...new Set([...existing.registeredChangeStableKeys, ...incoming.registeredChangeStableKeys]),
    ];
    existing.warnings = [...new Set([...existing.warnings, ...incoming.warnings])];
  }
  return pages.sort((left, right) =>
    left.pageNumber === right.pageNumber
      ? left.fileId.localeCompare(right.fileId)
      : left.pageNumber - right.pageNumber,
  );
}

function markAmbiguousBusinessMatches(
  payload: GcnExtractionPayloadV2,
  conflicts: GcnV2MergeConflict[],
  ambiguousPaths: Set<string>,
): void {
  markAmbiguousGroup(
    payload.data.owners,
    (owner) => ownerBusinessSignature(owner),
    (owner) => owner.stableKey,
    payload,
    conflicts,
    ambiguousPaths,
  );
  markAmbiguousGroup(
    payload.data.parcels,
    (parcel) => parcelBusinessSignature(parcel),
    (parcel) => parcel.stableKey,
    payload,
    conflicts,
    ambiguousPaths,
  );
  for (const parcel of payload.data.parcels) {
    markAmbiguousGroup(
      parcel.landUses,
      (landUse) => landUseBusinessSignature(landUse),
      (landUse) => landUse.stableKey,
      payload,
      conflicts,
      ambiguousPaths,
    );
  }
}

function markAmbiguousGroup<T>(
  items: readonly T[],
  signature: (item: T) => string | null,
  stableKey: (item: T) => string,
  payload: GcnExtractionPayloadV2,
  conflicts: GcnV2MergeConflict[],
  ambiguousPaths: Set<string>,
): void {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = signature(item);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keys = new Set(group.map(stableKey));
    if (keys.size < 2) continue;
    for (const item of group) {
      for (const observation of collectGcnV2FieldObservations(payload)) {
        if (observation.stableKey === stableKey(item)) {
          recordConflict(observation.fieldPath, "AMBIGUOUS_ARRAY_MATCH", conflicts, ambiguousPaths);
        }
      }
    }
  }
}

function ownerBusinessSignature(owner: GcnV2Owner): string | null {
  const organisationId = matchText(owner.organisationIdentityNumber);
  if (organisationId) return `org-id:${organisationId}`;
  const name = matchText(owner.fullName);
  const organisation = matchText(owner.organisationName);
  return name || organisation ? `owner:${organisation}:${name}` : null;
}

function parcelBusinessSignature(parcel: GcnV2Parcel): string | null {
  const sheet = matchText(parcel.mapSheetNumber);
  const number = matchText(parcel.parcelNumber);
  return sheet && number ? `parcel:${sheet}:${number}` : null;
}

function landUseBusinessSignature(landUse: GcnV2LandUse): string | null {
  const purpose = matchText(landUse.purposeCode ?? landUse.purposeFreeText);
  const area = matchText(landUse.area);
  return purpose ? `land-use:${purpose}:${area}` : null;
}

function nullConflictingValues(payload: GcnExtractionPayloadV2, conflictPaths: Set<string>): void {
  for (const fieldPath of conflictPaths) {
    if (fieldPath.startsWith("certificate.")) {
      const key = fieldPath.slice("certificate.".length) as keyof typeof payload.data.certificate;
      if (key in payload.data.certificate) payload.data.certificate[key] = null;
      continue;
    }
    const ownerMatch = /^owners\[([^\]]+)]\.([A-Za-z]+)$/.exec(fieldPath);
    if (ownerMatch) {
      const owner = payload.data.owners.find((item) => item.stableKey === ownerMatch[1]);
      if (owner) setNullableOwnerField(owner, ownerMatch[2]);
      continue;
    }
    const landUseMatch = /^parcels\[([^\]]+)]\.landUses\[([^\]]+)]\.([A-Za-z]+)$/.exec(fieldPath);
    if (landUseMatch) {
      const parcel = payload.data.parcels.find((item) => item.stableKey === landUseMatch[1]);
      const landUse = parcel?.landUses.find((item) => item.stableKey === landUseMatch[2]);
      if (landUse) setNullableLandUseField(landUse, landUseMatch[3]);
      continue;
    }
    const parcelMatch = /^parcels\[([^\]]+)]\.([A-Za-z]+)$/.exec(fieldPath);
    if (parcelMatch) {
      const parcel = payload.data.parcels.find((item) => item.stableKey === parcelMatch[1]);
      if (parcel) setNullableParcelField(parcel, parcelMatch[2]);
      continue;
    }
    const assetMatch = /^assets\[([^\]]+)]\.([A-Za-z]+)$/.exec(fieldPath);
    if (assetMatch) {
      const asset = payload.data.assets.find((item) => item.stableKey === assetMatch[1]);
      if (asset) setNullableAssetField(asset, assetMatch[2]);
      continue;
    }
    const changeMatch = /^registeredChanges\[([^\]]+)]\.([A-Za-z]+)$/.exec(fieldPath);
    if (changeMatch) {
      const change = payload.data.registeredChanges.find(
        (item) => item.stableKey === changeMatch[1],
      );
      if (change) setNullableChangeField(change, changeMatch[2]);
    }
  }
}

function setNullableOwnerField(owner: GcnV2Owner, key: string): void {
  if (key in owner && key !== "stableKey")
    (owner as unknown as Record<string, unknown>)[key] = null;
}

function setNullableParcelField(parcel: GcnV2Parcel, key: string): void {
  if (key in parcel && key !== "stableKey" && key !== "landUses") {
    (parcel as unknown as Record<string, unknown>)[key] = null;
  }
}

function setNullableLandUseField(landUse: GcnV2LandUse, key: string): void {
  if (key in landUse && key !== "stableKey") {
    (landUse as unknown as Record<string, unknown>)[key] = null;
  }
}

function setNullableAssetField(asset: GcnV2Asset, key: string): void {
  if (key in asset && key !== "stableKey")
    (asset as unknown as Record<string, unknown>)[key] = null;
}

function setNullableChangeField(change: GcnV2RegisteredChange, key: string): void {
  if (key in change && key !== "stableKey") {
    (change as unknown as Record<string, unknown>)[key] = null;
  }
}

function assertNoCrossCollectionStableKeyCollision(payload: GcnExtractionPayloadV2): void {
  const keys = [
    ...payload.data.owners.map((item) => item.stableKey),
    ...payload.data.parcels.map((item) => item.stableKey),
    ...payload.data.parcels.flatMap((parcel) => parcel.landUses.map((item) => item.stableKey)),
    ...payload.data.assets.map((item) => item.stableKey),
    ...payload.data.registeredChanges.map((item) => item.stableKey),
  ];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) throw new GcnV2MergeError(`stableKey bị trùng giữa các phần tử: ${key}.`);
    seen.add(key);
  }
}

function deduplicateEvidence(
  evidence: readonly GcnExtractionEvidenceV2[],
): GcnExtractionEvidenceV2[] {
  const seen = new Set<string>();
  const result: GcnExtractionEvidenceV2[] = [];
  for (const item of evidence) {
    const fingerprint = JSON.stringify(item);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(item);
  }
  return result;
}

function worstImageStatus(
  left: GcnExtractionPayloadV2["quality"]["imageStatus"],
  right: GcnExtractionPayloadV2["quality"]["imageStatus"],
): GcnExtractionPayloadV2["quality"]["imageStatus"] {
  const rank = { CLEAR: 0, BLURRY: 1, HANDWRITING: 2, MIXED: 3 } as const;
  return rank[left] >= rank[right] ? left : right;
}

function mergeNotes(left: string, right: string): string {
  const notes = [normalizeGcnText(left), normalizeGcnText(right)].filter(
    (value): value is string => !!value,
  );
  return [...new Set(notes)].join("; ").slice(0, 500);
}

function addWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function matchText(value: string | null | undefined): string {
  return (normalizeGcnText(value) ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
