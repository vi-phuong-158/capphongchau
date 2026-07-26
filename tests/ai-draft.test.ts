import { describe, expect, it } from "vitest";

import {
  aiExtractionPayloadSchema,
  applyClearAiFields,
  buildAiFieldComparisons,
  findInvalidClearEvidence,
} from "@/modules/ai-extraction/draft";
import { emptyDraft } from "@/modules/public-intake/types";
import { validateAiResultPayload } from "../scripts/ai/validator";

const clearField = (value: string) => ({
  value,
  sourceValue: value,
  status: "CLEAR" as const,
  evidence: { fileId: "file_gcn_1", pageLabel: "Trang 1", note: "Vùng tiêu đề" },
});

function validResult() {
  return {
    quality: { documentType: "CERTIFICATE" as const, imageStatus: "CLEAR" as const, note: "" },
    certificate: {
      issueNumber: clearField("CS 123456"),
      issueDate: clearField("2026-07-26"),
      registryNumber: clearField("CH 00123"),
    },
    unreadableFields: [],
  };
}

describe("AI draft cho cán bộ", () => {
  it("D1: chỉ nạp trường CLEAR đang trống, không ghi đè giá trị cán bộ/người dân", () => {
    const draft = emptyDraft("owner-1", "parcel-1", "use-1");
    draft.certificate.issueNumber = "Đã nhập";
    const payload = aiExtractionPayloadSchema.parse(validResult());
    const comparisons = buildAiFieldComparisons(draft, payload);
    const applied = applyClearAiFields(draft, comparisons);

    expect(applied.draft.certificate.issueNumber).toBe("Đã nhập");
    expect(applied.draft.certificate.issueDate).toBe("2026-07-26");
    expect(applied.draft.certificate.registryNumber).toBe("CH 00123");
    expect(applied.appliedFieldPaths).toEqual([
      "certificate.issueDate",
      "certificate.registryNumber",
    ]);
  });

  it("D2: ảnh mờ/chữ viết tay phải cảnh báo thay vì nhận là kết quả sạch", () => {
    const result: unknown = {
      quality: { documentType: "CERTIFICATE", imageStatus: "HANDWRITING", note: "Có ghi tay" },
      certificate: {
        issueNumber: {
          value: null,
          sourceValue: null,
          status: "MANUAL_REQUIRED",
          evidence: { fileId: "file_gcn_1", pageLabel: "Trang 1", note: "Có chữ viết tay" },
        },
        issueDate: clearField("2026-07-26"),
        registryNumber: clearField("CH 00123"),
      },
      unreadableFields: ["issueNumber"],
    };
    const issues = validateAiResultPayload(result);
    expect(issues.some((issue) => issue.code === "IMAGE_REQUIRES_MANUAL_REVIEW")).toBe(true);
    expect(issues.some((issue) => issue.severity === "BLOCKING")).toBe(false);
  });

  it("D3: schema AI không có trường CCCD/địa chỉ/chủ sử dụng để tránh nới phạm vi đọc", () => {
    const result = validResult() as Record<string, unknown>;
    result.identityNumber = "012345678901";
    expect(aiExtractionPayloadSchema.safeParse(result).success).toBe(false);
  });

  it("D4: chặn số giống CCCD ở mọi trường kết quả trước khi route có thể lưu raw JSON", () => {
    const result = validResult();
    result.quality.note = "CCCD 0123 456 789 01 không được phép xuất hiện ở đây";

    const issues = validateAiResultPayload(result);

    expect(issues.some((issue) => issue.code === "CITIZEN_ID_LIKE_VALUE")).toBe(true);
    expect(issues.some((issue) => issue.message.includes("0123"))).toBe(false);
  });

  it("D5: CLEAR phải có evidence và evidence chỉ được trỏ tới file GCN trong manifest", () => {
    const missingEvidence = {
      ...validResult(),
      certificate: {
        ...validResult().certificate,
        issueNumber: { ...validResult().certificate.issueNumber, evidence: null },
      },
    };
    expect(
      validateAiResultPayload(missingEvidence).some(
        (issue) => issue.code === "CLEAR_EVIDENCE_MISSING" && issue.severity === "BLOCKING",
      ),
    ).toBe(true);

    const foreignEvidence = aiExtractionPayloadSchema.parse(validResult());
    foreignEvidence.certificate.issueDate.evidence = {
      fileId: "file_khong_thuoc_manifest",
      pageLabel: "Trang 1",
      note: "Sai nguồn",
    };
    expect(findInvalidClearEvidence(foreignEvidence, new Set(["file_gcn_1"]))).toContainEqual({
      fieldPath: "certificate.issueDate",
      code: "CLEAR_EVIDENCE_NOT_IN_MANIFEST",
    });
  });
});
