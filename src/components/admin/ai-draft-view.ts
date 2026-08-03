import {
  GCN_V2_FIELD_CONTRACT,
  type GcnEvidenceStatus,
  type GcnFieldProvenance,
} from "@/modules/ai-extraction/gcn-v2-contract";

export interface AiDraftEvidenceEntryView {
  readonly rawText?: string | null;
  readonly pageNumber?: number | null;
  /** Số thứ tự ảnh GCN an toàn, do server suy ra từ manifest; không hiển thị fileId nội bộ. */
  readonly sourceImageOrdinal?: number | null;
  readonly confidence?: number | null;
  readonly status?: GcnEvidenceStatus;
  /** Hai trường legacy được giữ để kết quả AI ba trường cũ vẫn đọc được. */
  readonly pageLabel?: string;
  readonly note?: string;
}

export interface AiDraftEvidenceView extends AiDraftEvidenceEntryView {
  /** Toàn bộ nguồn cho field, gồm cả nguồn đầu tiên khi có mâu thuẫn. */
  readonly alternatives?: readonly AiDraftEvidenceEntryView[];
}

export interface AiDraftComparisonView {
  readonly fieldPath: string;
  readonly templatePath?: string;
  readonly entityLabel?: string;
  readonly currentValue: string;
  readonly aiValue: string | null;
  readonly sourceValue?: string | null;
  readonly fieldStatus: "CLEAR" | "CHECK" | "MANUAL_REQUIRED";
  readonly evidence?: AiDraftEvidenceView | null;
  readonly provenance?: GcnFieldProvenance;
  /** Tên canonical từ server GCN v2. */
  readonly applyable?: boolean;
  /** Alias dung nạp cho response thử nghiệm trước khi contract được khóa. */
  readonly canApply?: boolean;
}

export const AI_DRAFT_GROUPS = [
  { key: "certificate", label: "Giấy chứng nhận" },
  { key: "owners", label: "Chủ sử dụng" },
  { key: "parcels", label: "Thửa đất" },
  { key: "landUses", label: "Mục đích sử dụng đất" },
  { key: "assets", label: "Tài sản gắn liền với đất" },
  { key: "registeredChanges", label: "Nội dung biến động" },
] as const;

export type AiDraftGroupKey = (typeof AI_DRAFT_GROUPS)[number]["key"];

export interface AiDraftComparisonGroup {
  readonly key: AiDraftGroupKey;
  readonly label: string;
  readonly comparisons: AiDraftComparisonView[];
}

const FALLBACK_FIELD_LABELS: Readonly<Record<string, string>> = {
  content: "Nội dung biến động",
  confirmedDate: "Ngày xác nhận biến động",
  confirmedBy: "Cơ quan xác nhận",
};

function inferTemplatePath(fieldPath: string): string {
  const bracketNormalized = fieldPath.replace(/\[[^\]]*\]/g, "[]");
  if (
    bracketNormalized !== fieldPath ||
    GCN_V2_FIELD_CONTRACT.some((item) => item.path === fieldPath)
  )
    return bracketNormalized;

  const dottedLandUse = /^parcels\.[^.]+\.landUses\.[^.]+\.(.+)$/.exec(fieldPath);
  if (dottedLandUse) return `parcels[].landUses[].${dottedLandUse[1]}`;
  const dottedCollection = /^(owners|parcels|assets)\.[^.]+\.(.+)$/.exec(fieldPath);
  if (dottedCollection) return `${dottedCollection[1]}[].${dottedCollection[2]}`;
  if (fieldPath.startsWith("registeredChanges")) return "registeredChanges[]";
  return fieldPath;
}

export function comparisonTemplatePath(comparison: AiDraftComparisonView): string {
  return comparison.templatePath?.trim() || inferTemplatePath(comparison.fieldPath);
}

export function comparisonLabel(comparison: AiDraftComparisonView): string {
  const templatePath = comparisonTemplatePath(comparison);
  const definition = GCN_V2_FIELD_CONTRACT.find((entry) => entry.path === templatePath);
  if (definition)
    return comparison.entityLabel
      ? `${comparison.entityLabel} · ${definition.label}`
      : definition.label;
  const fieldName =
    comparison.fieldPath
      .split(".")
      .at(-1)
      ?.replace(/\[[^\]]*\]/g, "") ?? "";
  const label = FALLBACK_FIELD_LABELS[fieldName] ?? "Trường GCN khác";
  return comparison.entityLabel ? `${comparison.entityLabel} · ${label}` : label;
}

export function comparisonGroupKey(comparison: AiDraftComparisonView): AiDraftGroupKey {
  const templatePath = comparisonTemplatePath(comparison);
  if (templatePath.includes("landUses[]")) return "landUses";
  if (templatePath.startsWith("owners")) return "owners";
  if (templatePath.startsWith("parcels")) return "parcels";
  if (templatePath.startsWith("assets")) return "assets";
  if (templatePath.startsWith("registeredChanges")) return "registeredChanges";
  return "certificate";
}

export function groupAiDraftComparisons(
  comparisons: readonly AiDraftComparisonView[],
): AiDraftComparisonGroup[] {
  return AI_DRAFT_GROUPS.map((group) => ({
    ...group,
    comparisons: comparisons.filter((comparison) => comparisonGroupKey(comparison) === group.key),
  })).filter((group) => group.comparisons.length > 0);
}

export function comparisonEvidenceStatus(comparison: AiDraftComparisonView): GcnEvidenceStatus {
  if (comparison.evidence?.status) return comparison.evidence.status;
  if (comparison.fieldStatus === "CLEAR") return "EXTRACTED";
  if (comparison.fieldStatus === "CHECK") return "LOW_CONFIDENCE";
  return "UNREADABLE";
}

function hasValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Chỉ server quyết định trường có thể nạp; nhánh cuối là compatibility cho result ba trường cũ. */
export function isComparisonApplyable(comparison: AiDraftComparisonView): boolean {
  if (comparison.evidence?.status && comparison.evidence.status !== "EXTRACTED") return false;
  if (
    comparison.provenance !== undefined &&
    comparison.provenance !== "EMPTY" &&
    comparison.provenance !== "AI_PROPOSED"
  )
    return false;
  if (typeof comparison.applyable === "boolean") return comparison.applyable;
  if (typeof comparison.canApply === "boolean") return comparison.canApply;
  return (
    comparison.fieldStatus === "CLEAR" &&
    !hasValue(comparison.currentValue) &&
    hasValue(comparison.aiValue)
  );
}

/**
 * Mặc định chỉ chọn đề xuất đọc rõ và có nguồn cho phép AI điền. Cán bộ vẫn phải bấm nạp; kết quả
 * conflict, unreadable và low-confidence không bao giờ được tự chọn.
 */
export function isComparisonSelectedByDefault(comparison: AiDraftComparisonView): boolean {
  if (!isComparisonApplyable(comparison) || comparisonEvidenceStatus(comparison) !== "EXTRACTED")
    return false;
  return (
    comparison.provenance === undefined ||
    comparison.provenance === "EMPTY" ||
    comparison.provenance === "AI_PROPOSED"
  );
}

export function defaultSelectedFieldPaths(
  comparisons: readonly AiDraftComparisonView[],
): Set<string> {
  return new Set(
    comparisons.filter(isComparisonSelectedByDefault).map((comparison) => comparison.fieldPath),
  );
}

export function allApplyableFieldPaths(comparisons: readonly AiDraftComparisonView[]): Set<string> {
  return new Set(comparisons.filter(isComparisonApplyable).map((item) => item.fieldPath));
}

export function formatEvidenceConfidence(confidence: number | null | undefined): string {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "—";
  const percentage = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return `${percentage}%`;
}

export function evidenceEntriesForDisplay(
  evidence: AiDraftEvidenceView | null | undefined,
): readonly AiDraftEvidenceEntryView[] {
  if (!evidence) return [];
  return evidence.alternatives?.length ? evidence.alternatives : [evidence];
}

export function formatEvidenceSource(entry: AiDraftEvidenceEntryView): string {
  const image = entry.sourceImageOrdinal ? `Ảnh GCN ${entry.sourceImageOrdinal}` : null;
  const page = entry.pageNumber ? `trang ${entry.pageNumber}` : entry.pageLabel || null;
  return [image, page].filter(Boolean).join(" · ") || "Trang —";
}
