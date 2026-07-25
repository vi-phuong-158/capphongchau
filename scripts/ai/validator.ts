import { scanForPromptInjection } from "@/modules/ai-extraction/prompt-safety";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "BLOCKING" | "WARNING";
}

export function validateAiResultPayload(data: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!data || typeof data !== "object") {
    issues.push({
      code: "INVALID_ROOT",
      message: "AI Result phải là một object.",
      severity: "BLOCKING",
    });
    return issues;
  }
  const obj = data as Record<string, unknown>;
  if (!obj.certificate || typeof obj.certificate !== "object") {
    issues.push({
      code: "MISSING_CERTIFICATE",
      message: "Thiếu thông tin Giấy chứng nhận.",
      severity: "BLOCKING",
    });
  }
  if (!Array.isArray(obj.parcels)) {
    issues.push({
      code: "MISSING_PARCELS",
      message: "Danh sách thửa đất phải là mảng.",
      severity: "BLOCKING",
    });
  } else if (obj.parcels.length > 100) {
    issues.push({
      code: "EXCEEDED_MAX_PARCELS",
      message: `Số thửa đất (${obj.parcels.length}) vượt quá giới hạn 100 thửa/GCN.`,
      severity: "BLOCKING",
    });
  }
  if (!Array.isArray(obj.unreadableFields)) {
    issues.push({
      code: "MISSING_UNREADABLE_FIELDS",
      message:
        "Thiếu mảng unreadableFields — không xác định được trường nào AI không đọc rõ (GEMINI.md §6.4).",
      severity: "WARNING",
    });
  }

  // Kết quả có dấu hiệu mô hình "làm theo" chỉ dẫn giấu trong ảnh thay vì trích xuất dữ liệu thật
  // (GEMINI.md §6.2) — chặn lại, không âm thầm chấp nhận vào dữ liệu chính thức.
  const injectionFindings = scanForPromptInjection(obj);
  for (const finding of injectionFindings) {
    issues.push({
      code: "PROMPT_INJECTION_SUSPECTED",
      message: `Trường ${finding.fieldPath} chứa nội dung nghi ngờ prompt injection — cần cán bộ đối chiếu lại với ảnh gốc trước khi chấp nhận.`,
      severity: "BLOCKING",
    });
  }

  return issues;
}
