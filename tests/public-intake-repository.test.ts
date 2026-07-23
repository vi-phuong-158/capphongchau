import { describe, expect, it } from "vitest";

import { decodeSubmissionDraft } from "@/modules/public-intake/repository";
import { emptyDraft } from "@/modules/public-intake/types";

describe("decodeSubmissionDraft", () => {
  it("giải mã nháp legacy bị JSON.stringify hai lần", () => {
    const draft = emptyDraft("owner-1", "parcel-1", "land-use-1");

    expect(decodeSubmissionDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it("từ chối chuỗi không phải JSON object", () => {
    expect(decodeSubmissionDraft("không phải JSON")).toBeNull();
    expect(decodeSubmissionDraft("[]")).toBeNull();
  });
});
