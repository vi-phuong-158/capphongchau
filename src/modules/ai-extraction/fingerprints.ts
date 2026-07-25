import { createHash } from "node:crypto";

export function computeInputFingerprint(
  submissionId: string,
  citizenPayloadVersion: number,
  fileChecksums: readonly string[],
): string {
  const sorted = [...fileChecksums].sort();
  return createHash("sha256")
    .update(`${submissionId}:${citizenPayloadVersion}:${sorted.join(",")}`)
    .digest("hex");
}

function sortKeysRecursively(val: unknown): unknown {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(sortKeysRecursively);
  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    sortedObj[k] = sortKeysRecursively(obj[k]);
  }
  return sortedObj;
}

export function computeResultFingerprint(jobId: string, rawJson: unknown): string {
  const normalized =
    typeof rawJson === "string" ? rawJson : JSON.stringify(sortKeysRecursively(rawJson));
  return createHash("sha256").update(`${jobId}:${normalized}`).digest("hex");
}
