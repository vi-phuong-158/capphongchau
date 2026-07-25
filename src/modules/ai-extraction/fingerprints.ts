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

export function computeResultFingerprint(jobId: string, rawJson: unknown): string {
  const jsonStr = typeof rawJson === "string" ? rawJson : JSON.stringify(rawJson);
  return createHash("sha256").update(`${jobId}:${jsonStr}`).digest("hex");
}
