import { describe, expect, it } from "vitest";

import {
  aiJobCoverageKey,
  aiJobExpectedMetadata,
} from "@/modules/ai-extraction/gcn-v2-repository-job-key";

describe("GCN v2 AI job coverage", () => {
  it("does not let a legacy job cover the same input fingerprint for the new contract", () => {
    const base = { submissionId: "sub_1", inputFingerprint: "a".repeat(64) };
    const legacy = aiJobCoverageKey({
      ...base,
      promptVersion: "v2.0",
      schemaVersion: "v2.0",
    });
    const current = aiJobCoverageKey({
      ...base,
      promptVersion: "gcn-v2.0",
      schemaVersion: "gcn-v2.0",
    });

    expect(current).not.toBe(legacy);
  });

  it("provides the exact non-PII metadata template required by local submit", () => {
    expect(
      aiJobExpectedMetadata({
        inputFingerprint: "b".repeat(64),
        promptVersion: "gcn-v2.0",
        schemaVersion: "gcn-v2.0",
      }),
    ).toEqual({
      schemaVersion: "gcn-v2.0",
      promptVersion: "gcn-v2.0",
      sourceDocumentHash: "b".repeat(64),
    });
  });
});
