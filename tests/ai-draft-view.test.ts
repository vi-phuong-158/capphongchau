import { describe, expect, it } from "vitest";

import {
  allApplyableFieldPaths,
  comparisonEvidenceStatus,
  comparisonLabel,
  comparisonTemplatePath,
  defaultSelectedFieldPaths,
  evidenceEntriesForDisplay,
  formatEvidenceConfidence,
  formatEvidenceSource,
  groupAiDraftComparisons,
  type AiDraftComparisonView,
} from "@/components/admin/ai-draft-view";

function comparison(
  overrides: Partial<AiDraftComparisonView> & Pick<AiDraftComparisonView, "fieldPath">,
): AiDraftComparisonView {
  return {
    currentValue: "",
    aiValue: "Giá trị AI",
    fieldStatus: "CLEAR",
    evidence: { status: "EXTRACTED", confidence: 0.91, pageNumber: 2 },
    provenance: "EMPTY",
    applyable: true,
    ...overrides,
  };
}

describe("AI draft view helpers", () => {
  it("dùng registry contract để gắn nhãn và nhận cả path stable dạng bracket/dotted", () => {
    const bracket = comparison({ fieldPath: "owners[owner-01].fullName" });
    const dotted = comparison({ fieldPath: "parcels.parcel-01.landUses.land-01.originCode" });

    expect(comparisonTemplatePath(bracket)).toBe("owners[].fullName");
    expect(comparisonLabel(bracket)).toBe("Họ tên chủ sử dụng/người đại diện");
    expect(comparisonTemplatePath(dotted)).toBe("parcels[].landUses[].originCode");
    expect(comparisonLabel(dotted)).toBe("Nguồn gốc sử dụng");
  });

  it("gắn ordinal an toàn để phân biệt owner, thửa và mục đích trong mảng nhiều phần tử", () => {
    expect(
      comparisonLabel(
        comparison({
          fieldPath: "parcels[p-02].landUses[l-03].purposeCode",
          entityLabel: "Thửa 2 · Mục đích 3",
        }),
      ),
    ).toBe("Thửa 2 · Mục đích 3 · Mã loại đất");
    expect(
      comparisonLabel(comparison({ fieldPath: "owners[o-02].fullName", entityLabel: "Chủ 2" })),
    ).toBe("Chủ 2 · Họ tên chủ sử dụng/người đại diện");
  });

  it("chia đúng sáu nhóm nghiệp vụ theo thứ tự contract UI", () => {
    const grouped = groupAiDraftComparisons([
      comparison({ fieldPath: "certificate.issueNumber" }),
      comparison({ fieldPath: "owners[owner-01].fullName" }),
      comparison({ fieldPath: "parcels[parcel-01].parcelNumber" }),
      comparison({ fieldPath: "parcels[parcel-01].landUses[land-01].area" }),
      comparison({ fieldPath: "assets[asset-01].floorArea" }),
      comparison({ fieldPath: "registeredChanges[change-01].content" }),
    ]);

    expect(grouped.map((group) => group.key)).toEqual([
      "certificate",
      "owners",
      "parcels",
      "landUses",
      "assets",
      "registeredChanges",
    ]);
    expect(grouped.every((group) => group.comparisons.length === 1)).toBe(true);
  });

  it("mặc định chỉ chọn EXTRACTED có provenance an toàn", () => {
    const comparisons = [
      comparison({ fieldPath: "certificate.issueNumber" }),
      comparison({
        fieldPath: "certificate.issueDate",
        evidence: { status: "LOW_CONFIDENCE" },
      }),
      comparison({
        fieldPath: "certificate.registryNumber",
        evidence: { status: "CONFLICT" },
      }),
      comparison({
        fieldPath: "owners[owner-01].fullName",
        provenance: "OFFICER_EDITED",
      }),
      comparison({
        fieldPath: "parcels[parcel-01].area",
        evidence: { status: "UNREADABLE" },
      }),
    ];

    expect([...defaultSelectedFieldPaths(comparisons)]).toEqual(["certificate.issueNumber"]);
    expect([...allApplyableFieldPaths(comparisons)]).toEqual(["certificate.issueNumber"]);
  });

  it("giữ compatibility cho comparison ba trường legacy", () => {
    const legacy = comparison({
      fieldPath: "certificate.issueNumber",
      applyable: undefined,
      evidence: { pageLabel: "Trang 1", note: "Số phát hành" },
      provenance: undefined,
    });
    expect(comparisonEvidenceStatus(legacy)).toBe("EXTRACTED");
    expect([...defaultSelectedFieldPaths([legacy])]).toEqual(["certificate.issueNumber"]);
  });

  it("định dạng confidence an toàn và không hiển thị số ngoài miền", () => {
    expect(formatEvidenceConfidence(0.913)).toBe("91%");
    expect(formatEvidenceConfidence(-1)).toBe("0%");
    expect(formatEvidenceConfidence(2)).toBe("100%");
    expect(formatEvidenceConfidence(null)).toBe("—");
  });

  it("gắn nhãn ảnh/trang an toàn và giữ đủ nguồn evidence xung đột", () => {
    const evidence = {
      status: "CONFLICT" as const,
      alternatives: [
        {
          rawText: "CS 000123",
          status: "CONFLICT" as const,
          sourceImageOrdinal: 1,
          pageNumber: 1,
          confidence: 0.91,
        },
        {
          rawText: "CS 000128",
          status: "CONFLICT" as const,
          sourceImageOrdinal: 2,
          pageNumber: 1,
          confidence: 0.88,
        },
      ],
    };
    const entries = evidenceEntriesForDisplay(evidence);

    expect(entries).toHaveLength(2);
    expect(entries.map(formatEvidenceSource)).toEqual([
      "Ảnh GCN 1 · trang 1",
      "Ảnh GCN 2 · trang 1",
    ]);
    expect(entries.map((entry) => entry.rawText)).toEqual(["CS 000123", "CS 000128"]);
  });
});
