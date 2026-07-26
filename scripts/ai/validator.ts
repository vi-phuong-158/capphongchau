import { scanForPromptInjection } from "@/modules/ai-extraction/prompt-safety";
import { aiExtractionPayloadSchema, findInvalidClearEvidence } from "@/modules/ai-extraction/draft";
import { scanForCitizenIdLikeValues } from "@/modules/ai-extraction/pii-safety";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "BLOCKING" | "WARNING";
}

export function validateAiResultPayload(data: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const finding of scanForCitizenIdLikeValues(data)) {
    issues.push({
      code: "CITIZEN_ID_LIKE_VALUE",
      message: `Trường ${finding.fieldPath} chứa chuỗi giống số CCCD; hệ thống không nhận kết quả này.`,
      severity: "BLOCKING",
    });
  }
  const parsed = aiExtractionPayloadSchema.safeParse(data);
  if (!parsed.success) {
    issues.push({
      code: "INVALID_SCHEMA",
      message: "Kết quả AI không đúng schema đọc GCN được phép.",
      severity: "BLOCKING",
    });
    // Quét cả payload sai schema: kẻ tấn công không được né phát hiện chỉ bằng cách thêm/tráo
    // trường ngoài schema mà prompt yêu cầu.
    if (data && typeof data === "object") {
      for (const finding of scanForPromptInjection(data)) {
        issues.push({
          code: "PROMPT_INJECTION_SUSPECTED",
          message: `Trường ${finding.fieldPath} chứa nội dung nghi ngờ prompt injection — cần cán bộ đối chiếu lại với ảnh gốc trước khi chấp nhận.`,
          severity: "BLOCKING",
        });
      }
    }
    return issues;
  }
  const payload = parsed.data;
  for (const evidenceIssue of findInvalidClearEvidence(payload)) {
    issues.push({
      code: evidenceIssue.code,
      message: `Trường ${evidenceIssue.fieldPath} ở trạng thái CLEAR phải có bằng chứng ảnh GCN hợp lệ.`,
      severity: "BLOCKING",
    });
  }
  if (payload.quality.documentType !== "CERTIFICATE") {
    issues.push({
      code: "UNEXPECTED_DOCUMENT_TYPE",
      message: "AI không xác định đây là ảnh Giấy chứng nhận; không được nạp nháp.",
      severity: "BLOCKING",
    });
  }
  if (payload.quality.imageStatus !== "CLEAR") {
    issues.push({
      code: "IMAGE_REQUIRES_MANUAL_REVIEW",
      message: "Ảnh mờ hoặc có chữ viết tay; cán bộ phải đối chiếu các trường được cảnh báo.",
      severity: "WARNING",
    });
  }
  for (const [fieldPath, field] of Object.entries(payload.certificate)) {
    if (field.status === "MANUAL_REQUIRED" && field.value !== null) {
      issues.push({
        code: "MANUAL_FIELD_HAS_VALUE",
        message: `Trường ${fieldPath} cần nhập thủ công nhưng AI vẫn trả giá trị.`,
        severity: "BLOCKING",
      });
    }
    if (
      field.status !== "CLEAR" &&
      field.value !== null &&
      !payload.unreadableFields.includes(fieldPath)
    ) {
      issues.push({
        code: "MISSING_UNREADABLE_MARKER",
        message: `Trường ${fieldPath} chưa rõ phải có trong unreadableFields.`,
        severity: "WARNING",
      });
    }
  }

  // Kết quả có dấu hiệu mô hình "làm theo" chỉ dẫn giấu trong ảnh thay vì trích xuất dữ liệu thật
  // (GEMINI.md §6.2) — chặn lại, không âm thầm chấp nhận vào dữ liệu chính thức.
  const injectionFindings = scanForPromptInjection(payload);
  for (const finding of injectionFindings) {
    issues.push({
      code: "PROMPT_INJECTION_SUSPECTED",
      message: `Trường ${finding.fieldPath} chứa nội dung nghi ngờ prompt injection — cần cán bộ đối chiếu lại với ảnh gốc trước khi chấp nhận.`,
      severity: "BLOCKING",
    });
  }

  return issues;
}
