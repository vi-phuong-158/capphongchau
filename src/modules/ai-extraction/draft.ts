import { z } from "zod";

import type { IntakeDraft } from "@/modules/public-intake/types";

export const AI_FIELD_STATUSES = ["CLEAR", "CHECK", "MANUAL_REQUIRED"] as const;
export type AiFieldStatus = (typeof AI_FIELD_STATUSES)[number];

const evidenceSchema = z
  .object({
    fileId: z.string().trim().min(1).max(100),
    pageLabel: z.string().trim().max(120).default(""),
    note: z.string().trim().max(500).default(""),
  })
  .strict();

export const extractedFieldSchema = z
  .object({
    value: z.string().trim().max(200).nullable(),
    sourceValue: z.string().trim().max(200).nullable(),
    status: z.enum(AI_FIELD_STATUSES),
    evidence: evidenceSchema.nullable(),
  })
  .strict();

export const aiExtractionPayloadSchema = z
  .object({
    quality: z
      .object({
        documentType: z.enum(["CERTIFICATE", "OTHER", "UNKNOWN"]),
        imageStatus: z.enum(["CLEAR", "BLURRY", "HANDWRITING", "MIXED"]),
        note: z.string().trim().max(500).default(""),
      })
      .strict(),
    certificate: z
      .object({
        issueNumber: extractedFieldSchema,
        issueDate: extractedFieldSchema,
        registryNumber: extractedFieldSchema,
      })
      .strict(),
    unreadableFields: z.array(z.string().trim().min(1).max(120)).max(30),
  })
  .strict();

export type AiExtractionPayload = z.infer<typeof aiExtractionPayloadSchema>;

export interface AiFieldComparisonDraft {
  readonly fieldPath:
    "certificate.issueNumber" | "certificate.issueDate" | "certificate.registryNumber";
  readonly currentValue: string;
  readonly aiValue: string | null;
  readonly sourceValue: string | null;
  readonly fieldStatus: AiFieldStatus;
  readonly evidence: unknown;
}

/**
 * Chỉ các trường GCN cơ bản mới được AI đưa vào nút nạp nháp. Tên/chỉ định danh chủ sử dụng
 * không được mô hình trả về để ranh giới "không đọc CCCD" không bị nới lỏng ngầm.
 */
export function buildAiFieldComparisons(
  current: IntakeDraft,
  payload: AiExtractionPayload,
): AiFieldComparisonDraft[] {
  const fields = [
    ["certificate.issueNumber", current.certificate.issueNumber, payload.certificate.issueNumber],
    ["certificate.issueDate", current.certificate.issueDate, payload.certificate.issueDate],
    [
      "certificate.registryNumber",
      current.certificate.registryNumber,
      payload.certificate.registryNumber,
    ],
  ] as const;
  return fields.map(([fieldPath, currentValue, extracted]) => ({
    fieldPath,
    currentValue,
    aiValue: extracted.value,
    sourceValue: extracted.sourceValue,
    fieldStatus: extracted.status,
    evidence: extracted.evidence ?? {},
  }));
}

export function applyClearAiFields(
  draft: IntakeDraft,
  comparisons: readonly AiFieldComparisonDraft[],
): { draft: IntakeDraft; appliedFieldPaths: string[] } {
  const next = structuredClone(draft);
  const appliedFieldPaths: string[] = [];
  for (const comparison of comparisons) {
    if (
      comparison.fieldStatus !== "CLEAR" ||
      !comparison.aiValue ||
      comparison.currentValue.trim()
    ) {
      continue;
    }
    switch (comparison.fieldPath) {
      case "certificate.issueNumber":
        next.certificate.issueNumber = comparison.aiValue;
        break;
      case "certificate.issueDate":
        next.certificate.issueDate = comparison.aiValue;
        break;
      case "certificate.registryNumber":
        next.certificate.registryNumber = comparison.aiValue;
        break;
    }
    appliedFieldPaths.push(comparison.fieldPath);
  }
  return { draft: next, appliedFieldPaths };
}
