/** Khóa coverage phải mang version để result legacy không che job GCN v2 cùng bộ ảnh. */
export function aiJobCoverageKey(input: {
  submissionId: string;
  inputFingerprint: string;
  promptVersion: string;
  schemaVersion: string;
}): string {
  return [
    input.submissionId,
    input.inputFingerprint,
    input.promptVersion,
    input.schemaVersion,
  ].join(":");
}

export function aiJobExpectedMetadata(input: {
  inputFingerprint: string;
  promptVersion: string;
  schemaVersion: string;
}): {
  readonly schemaVersion: string;
  readonly promptVersion: string;
  readonly sourceDocumentHash: string;
} {
  return {
    schemaVersion: input.schemaVersion,
    promptVersion: input.promptVersion,
    sourceDocumentHash: input.inputFingerprint,
  };
}
