import { createHash } from "node:crypto";

import {
  ASSET_TYPE_OPTIONS,
  CERTIFICATE_ROLE_OPTIONS,
  LAND_ORIGIN_OPTIONS,
  LAND_PURPOSE_SELECT_OPTIONS,
  LAND_USE_FORM_OPTIONS,
  LAND_USE_TERM_OPTIONS,
  OLD_WARD_OPTIONS,
  type ReferenceOption,
} from "../public-intake/reference";
import { OWNER_TYPE_LABELS, OWNER_TYPES, type OwnerType } from "../public-intake/types";
import type { GcnExtractionDataV2, GcnExtractionPayloadV2 } from "./gcn-v2-contract";

export type GcnStableKeyKind = "owner" | "parcel" | "landuse" | "asset" | "change";

export interface GcnStableKeySeed {
  readonly kind: GcnStableKeyKind;
  /** Khóa nghiệp vụ đã đọc; giá trị chỉ đi vào SHA-256, không xuất hiện trong stable key. */
  readonly businessParts: readonly (string | null | undefined)[];
  readonly fileId?: string | null;
  readonly pageNumber?: number | null;
  readonly ordinal?: number;
  /** Land use/asset phải gồm anchor của thửa cha để không va chạm giữa các bảng con. */
  readonly parentStableKey?: string | null;
}

/**
 * Sinh khóa ổn định không chứa PII thô. Source anchor (file/trang/dòng đầu tiên thấy thực thể, và
 * parent với bảng con) được ưu tiên hơn text OCR: đọc lại/sửa text cùng dòng không sinh thực thể mới.
 * Khi cùng thực thể được nhắc ở trang khác, caller phải giữ lại anchor của lần xuất hiện đầu tiên.
 */
export function createGcnStableKey(seed: GcnStableKeySeed): string {
  const businessKey = seed.businessParts
    .map((part) => normalizeMatchText(part ?? ""))
    .filter(Boolean)
    .join("\u001f");
  const sourceAnchor = [
    seed.fileId ?? "",
    seed.pageNumber ?? "",
    seed.ordinal ?? 0,
    seed.parentStableKey ?? "",
  ].join("\u001f");
  const identity = sourceAnchor.replace(/\u001f/g, "") ? sourceAnchor : businessKey;
  const digest = createHash("sha256")
    .update(`gcn-v2\u001f${seed.kind}\u001f${identity}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `gcn_${seed.kind}_${digest}`;
}

export function normalizeGcnText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.normalize("NFC").replace(/\s+/g, " ").trim();
  return normalized || null;
}

/** Giữ số 0 đầu; chỉ dọn khoảng trắng và chuẩn hóa chữ cái. */
export function normalizeGcnIdentifier(value: string | null | undefined): string | null {
  const normalized = normalizeGcnText(value);
  return normalized?.toLocaleUpperCase("vi-VN") ?? null;
}

export function normalizeGcnDate(value: string | null | undefined): string | null {
  const normalized = normalizeGcnText(value);
  if (!normalized) return null;
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (isoMatch) return buildIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);
  const numericMatch = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(normalized);
  if (numericMatch) return buildIsoDate(numericMatch[3], numericMatch[2], numericMatch[1]);
  const folded = foldDiacritics(normalized).toLowerCase();
  const vietnameseMatch = /(?:ngay\s*)?(\d{1,2})\s*thang\s*(\d{1,2})\s*nam\s*(\d{4})/.exec(folded);
  return vietnameseMatch
    ? buildIsoDate(vietnameseMatch[3], vietnameseMatch[2], vietnameseMatch[1])
    : null;
}

/**
 * Chuẩn hóa số diện tích theo cách ghi Việt Nam: `1.234,50 m²` thành `1234.5`. Chuỗi không xác
 * định chắc chắn là số dương/0 hợp lệ trả `null`, để evidence gốc còn nguyên cho cán bộ.
 */
export function normalizeGcnDecimal(value: string | null | undefined): string | null {
  const normalized = normalizeGcnText(value);
  if (!normalized) return null;
  let numeric = normalized
    .replace(/(?:m\s*[²2]|㎡)/giu, "")
    .replace(/\s+/g, "")
    .trim();
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(numeric)) {
    numeric = numeric.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+,\d+$/.test(numeric)) {
    numeric = numeric.replace(",", ".");
  } else if (!/^\d+(?:\.\d+)?$/.test(numeric)) {
    return null;
  }
  const [integerPart, fractionalPart = ""] = numeric.split(".");
  const canonicalInteger = integerPart.replace(/^0+(?=\d)/, "") || "0";
  const canonicalFraction = fractionalPart.replace(/0+$/, "");
  return canonicalFraction ? `${canonicalInteger}.${canonicalFraction}` : canonicalInteger;
}

export function normalizeGcnEnum(
  value: string | null | undefined,
  options: readonly ReferenceOption[],
): string | null {
  const normalized = normalizeGcnText(value);
  if (!normalized) return null;
  const matchKey = normalizeMatchText(normalized);
  const matches = options.filter(
    (option) =>
      normalizeMatchText(option.code) === matchKey || normalizeMatchText(option.label) === matchKey,
  );
  return matches.length === 1 ? matches[0].code : null;
}

export function normalizeOwnerType(value: string | null | undefined): OwnerType | null {
  const options = OWNER_TYPES.map((code) => ({ code, label: OWNER_TYPE_LABELS[code] }));
  return normalizeGcnEnum(value, options) as OwnerType | null;
}

/**
 * Chuẩn hóa payload đã được agent dựng. Hàm không đổi stableKey/evidence path, nhờ đó evidence vẫn
 * truy nguyên đúng lá; rawText không bị sửa. Enum lạ trả null thay vì đoán.
 */
export function normalizeGcnExtractionPayloadV2(
  payload: GcnExtractionPayloadV2,
): GcnExtractionPayloadV2 {
  return {
    ...payload,
    quality: { ...payload.quality, note: normalizeGcnText(payload.quality.note) ?? "" },
    data: normalizeGcnExtractionDataV2(payload.data),
    pages: payload.pages.map((page) => ({
      ...page,
      warnings: page.warnings.map(normalizeRequiredText),
    })),
    evidence: payload.evidence.map((evidence) => ({
      ...evidence,
      rawText: normalizeGcnText(evidence.rawText),
    })),
    warnings: payload.warnings.map(normalizeRequiredText),
    metadata: {
      ...payload.metadata,
      modelIdentifier: normalizeRequiredText(payload.metadata.modelIdentifier),
      sourceDocumentHash: payload.metadata.sourceDocumentHash?.toLowerCase() ?? null,
    },
  };
}

export function normalizeGcnExtractionDataV2(data: GcnExtractionDataV2): GcnExtractionDataV2 {
  return {
    certificate: {
      issueNumber: normalizeGcnIdentifier(data.certificate.issueNumber),
      issueDate: normalizeGcnDate(data.certificate.issueDate),
      registryNumber: normalizeGcnIdentifier(data.certificate.registryNumber),
    },
    owners: data.owners.map((owner) => ({
      ...owner,
      ownerType: normalizeOwnerType(owner.ownerType),
      organisationName: normalizeGcnText(owner.organisationName),
      organisationIdentityNumber: normalizeGcnIdentifier(owner.organisationIdentityNumber),
      fullName: normalizeGcnText(owner.fullName),
      dateOfBirth: normalizeGcnDate(owner.dateOfBirth),
      gender: normalizeGender(owner.gender),
      residenceAddress: normalizeGcnText(owner.residenceAddress),
      roleOnCertificate: normalizeGcnEnum(owner.roleOnCertificate, CERTIFICATE_ROLE_OPTIONS),
    })),
    parcels: data.parcels.map((parcel) => ({
      ...parcel,
      parcelIdCode: normalizeGcnIdentifier(parcel.parcelIdCode),
      mapSheetNumber: normalizeGcnIdentifier(parcel.mapSheetNumber),
      parcelNumber: normalizeGcnIdentifier(parcel.parcelNumber),
      addressOnCertificate: normalizeGcnText(parcel.addressOnCertificate),
      oldWard: normalizeGcnEnum(parcel.oldWard, OLD_WARD_OPTIONS),
      area: normalizeGcnDecimal(parcel.area),
      landUses: parcel.landUses.map((landUse) => ({
        ...landUse,
        purposeCode: normalizeGcnEnum(landUse.purposeCode, LAND_PURPOSE_SELECT_OPTIONS),
        purposeFreeText: normalizeGcnText(landUse.purposeFreeText),
        area: normalizeGcnDecimal(landUse.area),
        originCode: normalizeGcnEnum(landUse.originCode, LAND_ORIGIN_OPTIONS),
        formCode: normalizeGcnEnum(landUse.formCode, LAND_USE_FORM_OPTIONS),
        termCode: normalizeGcnEnum(landUse.termCode, LAND_USE_TERM_OPTIONS),
      })),
    })),
    assets: data.assets.map((asset) => ({
      ...asset,
      assetType: normalizeGcnEnum(asset.assetType, ASSET_TYPE_OPTIONS),
      description: normalizeGcnText(asset.description),
      mixedUseBuildingName: normalizeGcnText(asset.mixedUseBuildingName),
      apartmentBuildingName: normalizeGcnText(asset.apartmentBuildingName),
      apartmentNumber: normalizeGcnIdentifier(asset.apartmentNumber),
      constructionArea: normalizeGcnDecimal(asset.constructionArea),
      floorArea: normalizeGcnDecimal(asset.floorArea),
      ownershipForm: normalizeGcnText(asset.ownershipForm),
      ownershipTerm: normalizeGcnText(asset.ownershipTerm),
      grade: normalizeGcnText(asset.grade),
    })),
    registeredChanges: data.registeredChanges.map((change) => ({
      ...change,
      confirmedDate: normalizeGcnDate(change.confirmedDate),
      content: normalizeGcnText(change.content),
      confirmedBy: normalizeGcnText(change.confirmedBy),
    })),
  };
}

function normalizeGender(value: string | null | undefined): "NAM" | "NU" | null {
  const match = normalizeMatchText(value ?? "");
  if (match === "nam") return "NAM";
  if (match === "nu") return "NU";
  return null;
}

function normalizeMatchText(value: string): string {
  return foldDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function foldDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d");
}

function buildIsoDate(yearText: string, monthText: string, dayText: string): string | null {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeRequiredText(value: string): string {
  return normalizeGcnText(value) ?? "";
}
