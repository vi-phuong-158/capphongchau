import { describe, expect, it } from "vitest";

import {
  GCN_EVIDENCE_STATUSES,
  GCN_FIELD_PROVENANCE_STATES,
  GCN_V2_FIELD_CONTRACT,
  GCN_V2_PROMPT_VERSION,
  GCN_V2_SCHEMA_VERSION,
} from "@/modules/ai-extraction/gcn-v2-contract";

describe("GCN v2 field contract", () => {
  it("khóa version và tập trạng thái evidence/provenance", () => {
    expect(GCN_V2_SCHEMA_VERSION).toBe("gcn-v2.0");
    expect(GCN_V2_PROMPT_VERSION).toBe("gcn-v2.0");
    expect(GCN_EVIDENCE_STATUSES).toEqual([
      "EXTRACTED",
      "LOW_CONFIDENCE",
      "UNREADABLE",
      "CONFLICT",
      "NOT_FOUND",
    ]);
    expect(GCN_FIELD_PROVENANCE_STATES).toEqual([
      "EMPTY",
      "AI_PROPOSED",
      "CITIZEN_PROVIDED",
      "OFFICER_EDITED",
      "OFFICER_CONFIRMED",
      "CONFLICT",
      "UNREADABLE",
    ]);
  });

  it("không có path trùng và mọi trường AI đọc đều có chiến lược apply rõ", () => {
    const paths = GCN_V2_FIELD_CONTRACT.map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(
      GCN_V2_FIELD_CONTRACT.filter((entry) => entry.aiRead).every(
        (entry) => String(entry.aiApply) !== "NEVER",
      ),
    ).toBe(true);
  });

  it("giữ CCCD và các trường hệ thống ngoài phạm vi AI", () => {
    for (const path of [
      "owners[].identityNumber",
      "owners[].currentUserCitizenId",
      "parcels[].cadastralMapSheetNumber",
      "parcels[].cadastralParcelNumber",
      "parcels[].addressTwoLevel",
    ]) {
      expect(GCN_V2_FIELD_CONTRACT.find((entry) => entry.path === path)).toMatchObject({
        aiRead: false,
        aiApply: "NEVER",
      });
    }
  });

  it("bao phủ các nhóm GCN, chủ, thửa, land use, tài sản và biến động", () => {
    const paths = GCN_V2_FIELD_CONTRACT.map((entry) => entry.path);
    expect(paths.some((path) => path.startsWith("certificate."))).toBe(true);
    expect(paths.some((path) => path.startsWith("owners[]."))).toBe(true);
    expect(paths.some((path) => path.startsWith("parcels[]."))).toBe(true);
    expect(paths.some((path) => path.includes("landUses[]"))).toBe(true);
    expect(paths.some((path) => path.startsWith("assets[]."))).toBe(true);
    expect(paths).toContain("registeredChanges[]");
  });
});
