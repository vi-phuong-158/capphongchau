import { describe, expect, it } from "vitest";
import {
  computeInputFingerprint,
  computeResultFingerprint,
} from "@/modules/ai-extraction/fingerprints";

describe("AI Extraction fingerprints and module tests", () => {
  it("F1: computeInputFingerprint is deterministic regardless of checksum array order", () => {
    const fp1 = computeInputFingerprint("sub_1", 1, ["hashA", "hashB"]);
    const fp2 = computeInputFingerprint("sub_1", 1, ["hashB", "hashA"]);
    expect(fp1).toBe(fp2);
    expect(fp1.length).toBe(64);
  });

  it("F2: computeResultFingerprint returns sha256 hex string", () => {
    const fp = computeResultFingerprint("job_1", { parcels: [{ number: "10" }] });
    expect(fp.length).toBe(64);
  });

  it("F3: computeResultFingerprint is key-order agnostic", () => {
    const objA = { b: "2", a: "1", nested: { y: "2", x: "1" } };
    const objB = { a: "1", b: "2", nested: { x: "1", y: "2" } };
    const fpA = computeResultFingerprint("job_1", objA);
    const fpB = computeResultFingerprint("job_1", objB);
    expect(fpA).toBe(fpB);
  });
});
