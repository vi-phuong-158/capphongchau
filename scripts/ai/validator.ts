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
  return issues;
}
