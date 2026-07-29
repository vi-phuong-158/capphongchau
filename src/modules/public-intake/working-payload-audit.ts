import type { IntakeDraft } from "./types";

export interface WorkingPayloadAuditSummary {
  readonly changedFieldPaths: readonly string[];
  readonly automaticOverrideReasons: readonly {
    fieldPath: string;
    reason: string;
  }[];
}

function collectChangedPaths(
  previous: unknown,
  next: unknown,
  path: string,
  output: string[],
): void {
  if (Object.is(previous, next)) return;
  if (
    typeof previous !== "object" ||
    previous === null ||
    typeof next !== "object" ||
    next === null ||
    Array.isArray(previous) !== Array.isArray(next)
  ) {
    output.push(path);
    return;
  }

  if (Array.isArray(previous) && Array.isArray(next)) {
    const length = Math.max(previous.length, next.length);
    for (let index = 0; index < length; index += 1) {
      collectChangedPaths(previous[index], next[index], `${path}.${index}`, output);
    }
    return;
  }

  const left = previous as Record<string, unknown>;
  const right = next as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of [...keys].sort()) {
    collectChangedPaths(left[key], right[key], path ? `${path}.${key}` : key, output);
  }
}

/**
 * Audit chỉ ghi đường dẫn trường và lý do ghi đè, không ghi giá trị trước/sau để CCCD, tên hoặc
 * địa chỉ không lọt vào metadata kỹ thuật.
 */
export function summarizeWorkingPayloadChanges(
  previous: IntakeDraft | null,
  next: IntakeDraft,
): WorkingPayloadAuditSummary {
  const changedFieldPaths: string[] = [];
  collectChangedPaths(previous ?? {}, next, "", changedFieldPaths);

  const automaticOverrideReasons: { fieldPath: string; reason: string }[] = [];
  if (next.wardAdministrativeCodeOverride?.trim()) {
    automaticOverrideReasons.push({
      fieldPath: "wardAdministrativeCodeOverride",
      reason: next.wardAdministrativeCodeOverrideReason?.trim() ?? "",
    });
  }
  if (next.scannedFileNamesOverride?.trim()) {
    automaticOverrideReasons.push({
      fieldPath: "scannedFileNamesOverride",
      reason: next.scannedFileNamesOverrideReason?.trim() ?? "",
    });
  }
  next.parcels.forEach((parcel, index) => {
    if (parcel.cadastralMapSheetNumber?.trim()) {
      automaticOverrideReasons.push({
        fieldPath: `parcels.${index}.cadastralMapSheetNumber`,
        reason: parcel.cadastralMapSheetOverrideReason?.trim() ?? "",
      });
    }
  });

  return {
    changedFieldPaths: changedFieldPaths.slice(0, 250),
    automaticOverrideReasons,
  };
}
