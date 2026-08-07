import { scanForPromptInjection } from "@/modules/ai-extraction/prompt-safety";
import {
  aiExtractionPayloadAnySchema,
  findInvalidClearEvidence,
  findInvalidGcnV2Evidence,
  isGcnExtractionPayloadV2,
  type AiExtractionPayload,
  type GcnExtractionPayloadV2,
} from "@/modules/ai-extraction/draft";
import { GCN_V2_FIELD_CONTRACT } from "@/modules/ai-extraction/gcn-v2-contract";
import { collectGcnV2FieldObservations } from "@/modules/ai-extraction/gcn-v2-schema";
import { scanForCitizenIdLikeValues } from "@/modules/ai-extraction/pii-safety";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "BLOCKING" | "WARNING";
}

/**
 * Khóa kỹ thuật trong kết quả AI: định danh file, hash bộ ảnh, stable key và metadata phiên bản/model
 * đều do máy sinh chứ không phải chữ đọc từ ảnh GCN. UUID của `public_files.file_id` (ví dụ
 * `3c525586-3646-4832-8015-dfc9b3504e95` → `3646-4832-8015` = 12 chữ số) và sha256 có thể chứa chuỗi
 * 12 chữ số nên bị `scanForCitizenIdLikeValues` nhận nhầm là CCCD, chặn oan mọi job có fileId dạng
 * này. Loại các khóa này khỏi phạm vi quét; giá trị nghiệp vụ và evidence.rawText/note/warning vẫn bị
 * quét đầy đủ. An toàn vì các khóa này còn được đối chiếu manifest/pattern ở đường ghi, một CCCD trần
 * đặt vào đó cũng không qua được các guard khác.
 */
const AI_TECHNICAL_KEYS: ReadonlySet<string> = new Set([
  "fileId",
  "pageNumber",
  "sourceDocumentHash",
  "stableKey",
  "ownerStableKeys",
  "parcelStableKeys",
  "registeredChangeStableKeys",
  "schemaVersion",
  "promptVersion",
  "modelIdentifier",
  "pagesProcessed",
]);

export function validateAiResultPayload(data: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const finding of scanForCitizenIdLikeValues(data, { skipKeys: AI_TECHNICAL_KEYS })) {
    issues.push({
      code: "CITIZEN_ID_LIKE_VALUE",
      message: `Trường ${finding.fieldPath} chứa chuỗi giống số CCCD; hệ thống không nhận kết quả này.`,
      severity: "BLOCKING",
    });
  }
  const parsed = aiExtractionPayloadAnySchema.safeParse(data);
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
  if (isGcnExtractionPayloadV2(payload)) {
    validateGcnV2Payload(payload, issues);
  } else {
    validateLegacyPayload(payload, issues);
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

function validateLegacyPayload(payload: AiExtractionPayload, issues: ValidationIssue[]): void {
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
}

function validateGcnV2Payload(payload: GcnExtractionPayloadV2, issues: ValidationIssue[]): void {
  for (const evidenceIssue of findInvalidGcnV2Evidence(payload)) {
    issues.push({
      code: evidenceIssue.code,
      message: `Trường ${evidenceIssue.fieldPath} không có bằng chứng GCN v2 hợp lệ.`,
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
      message: "Có trang GCN mờ hoặc chữ viết tay; cán bộ phải đối chiếu evidence được cảnh báo.",
      severity: "WARNING",
    });
  }
  if (payload.pages.some((page) => page.imageStatus !== "CLEAR")) {
    issues.push({
      code: "PAGE_REQUIRES_MANUAL_REVIEW",
      message: "Ít nhất một trang GCN cần cán bộ xem lại chất lượng ảnh.",
      severity: "WARNING",
    });
  }
  if (!payload.metadata.sourceDocumentHash) {
    issues.push({
      code: "SOURCE_DOCUMENT_HASH_MISSING",
      message: "Kết quả chưa có sourceDocumentHash để đối chiếu toàn bộ bộ ảnh.",
      severity: "WARNING",
    });
  }
  if (payload.warnings.length > 0 || payload.pages.some((page) => page.warnings.length > 0)) {
    issues.push({
      code: "EXTRACTION_WARNING_REQUIRES_REVIEW",
      message: "Kết quả hoặc trang GCN có cảnh báo trích xuất; cán bộ phải đối chiếu ảnh gốc.",
      severity: "WARNING",
    });
  }
  if (payload.evidence.some((evidence) => evidence.status === "CONFLICT")) {
    issues.push({
      code: "FIELD_CONFLICT_REQUIRES_REVIEW",
      message: "Kết quả có trường mâu thuẫn giữa các trang; hệ thống không tự chọn giá trị.",
      severity: "WARNING",
    });
  }
  const unreadableRequiredCount = countUnreadableRequiredFields(payload);
  if (unreadableRequiredCount > 0) {
    issues.push({
      code: "FIELD_REQUIRES_MANUAL_REVIEW",
      message:
        `Có ${unreadableRequiredCount} trường bắt buộc chưa đọc rõ; ` +
        "cán bộ phải đối chiếu ảnh gốc.",
      severity: "WARNING",
    });
  }
  if (payload.data.registeredChanges.length > 0) {
    issues.push({
      code: "REGISTERED_CHANGE_REVIEW_ONLY",
      message:
        "GCN có nội dung biến động; nội dung này chỉ hiển thị để đối chiếu, không tự áp dụng.",
      severity: "WARNING",
    });
  }
}

/** Chỉ các trường AI đọc mà completion bắt buộc mới đáng để cán bộ mở lại ảnh gốc. */
const REQUIRED_AI_TEMPLATE_PATHS: ReadonlySet<string> = new Set(
  GCN_V2_FIELD_CONTRACT.filter((entry) => entry.aiRead && entry.requiredAtCompletion).map(
    (entry) => entry.path,
  ),
);

/**
 * Ngày sinh và giới tính không in trên GCN của tổ chức/cộng đồng dân cư, nên `NOT_FOUND` ở đó là
 * đúng nghiệp vụ chứ không phải trường cần đối chiếu lại.
 */
function isExpectedMissingForOrganisation(
  payload: GcnExtractionPayloadV2,
  templatePath: string,
  stableKey: string | null,
): boolean {
  if (templatePath !== "owners[].dateOfBirth" && templatePath !== "owners[].gender") return false;
  const ownerType = payload.data.owners.find((owner) => owner.stableKey === stableKey)?.ownerType;
  return ownerType === "TO_CHUC" || ownerType === "CONG_DONG_DAN_CU";
}

/**
 * Trước đây bất kỳ evidence `LOW_CONFIDENCE`/`UNREADABLE`/`NOT_FOUND` nào cũng bật cảnh báo. Với
 * hợp đồng đầy đủ, GCN thật hầu như luôn thiếu tổ chức, tài sản hoặc biến động, nên cảnh báo bật ở
 * gần như mọi hồ sơ và mất hết ý nghĩa. Chỉ đếm trường bắt buộc để tín hiệu còn đáng đọc.
 */
function countUnreadableRequiredFields(payload: GcnExtractionPayloadV2): number {
  const readablePaths = new Set(
    payload.evidence
      .filter((evidence) => evidence.status === "EXTRACTED")
      .map((evidence) => evidence.fieldPath),
  );
  return collectGcnV2FieldObservations(payload).filter(
    (observation) =>
      REQUIRED_AI_TEMPLATE_PATHS.has(observation.templatePath) &&
      !readablePaths.has(observation.fieldPath) &&
      !isExpectedMissingForOrganisation(payload, observation.templatePath, observation.stableKey),
  ).length;
}
