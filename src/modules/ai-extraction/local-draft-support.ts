import path from "node:path";

import type { ValidationIssue } from "../../../scripts/ai/validator";
import type { AiExtractionPayload } from "./draft";

export type LocalDraftMode = "list" | "enqueue" | "submit";

export interface LocalDraftOptions {
  readonly mode: LocalDraftMode;
  readonly jobId: string;
  readonly submissionId: string;
  readonly resultPath: string;
  readonly modelName: string;
  readonly driveRoot: string;
  readonly limit: number;
}

/**
 * Tách khỏi script để kiểm được bằng unit test: sai tham số ở trạm cục bộ phải dừng trước khi mở
 * kết nối cơ sở dữ liệu, không phải sau khi đã ghi nửa chừng.
 */
export function parseLocalDraftOptions(
  argv: readonly string[],
  environmentDriveRoot: string,
): LocalDraftOptions {
  const mode = argv[0];
  if (mode !== "list" && mode !== "enqueue" && mode !== "submit") {
    throw new Error("Chế độ phải là `list`, `enqueue` hoặc `submit`.");
  }
  const flags = new Map<string, string>();
  for (const argument of argv.slice(1)) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match) throw new Error(`Tham số không hợp lệ: ${argument}`);
    flags.set(match[1], match[2]);
  }
  const driveRoot = flags.get("drive-root") ?? environmentDriveRoot;
  if (!driveRoot) {
    throw new Error(
      "Thiếu thư mục Drive cục bộ. Đặt AI_LOCAL_DRIVE_ROOT trong .env.local hoặc truyền --drive-root=",
    );
  }
  const limit = Number(flags.get("limit") ?? "20");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("--limit phải là số nguyên trong khoảng 1..200.");
  }
  const base = {
    jobId: flags.get("job") ?? "",
    submissionId: flags.get("submission") ?? "",
    resultPath: flags.get("result") ?? "",
    modelName: flags.get("model") ?? "",
    driveRoot,
    limit,
  };
  if (mode === "enqueue" && !base.submissionId) {
    throw new Error("`enqueue` cần --submission=.");
  }
  if (mode === "submit" && (!base.jobId || !base.resultPath || !base.modelName)) {
    throw new Error("`submit` cần đủ --job=, --result= và --model=.");
  }
  return { mode, ...base };
}

export interface ResultOutcome {
  readonly warningCount: number;
  readonly blockingCount: number;
  readonly validationStatus: "PASSED" | "REVIEW_REQUIRED" | "BLOCKED";
  readonly nextJobStatus: "COMPLETED" | "NEEDS_REVIEW" | "QUARANTINED";
}

/**
 * Cùng bậc thang phân loại với `POST /api/ai/results`: đường ghi cục bộ không được dễ dãi hơn đường
 * API, nếu không cán bộ sẽ thấy hai mức tin cậy khác nhau cho cùng một chất lượng đọc.
 */
export function decideResultOutcome(
  issues: readonly ValidationIssue[],
  invalidClearEvidenceCount: number,
): ResultOutcome {
  const warningCount = issues.filter((issue) => issue.severity === "WARNING").length;
  const blockingCount =
    issues.filter((issue) => issue.severity === "BLOCKING").length + invalidClearEvidenceCount;
  const validationStatus =
    blockingCount > 0 ? "BLOCKED" : warningCount > 0 ? "REVIEW_REQUIRED" : "PASSED";
  const nextJobStatus =
    validationStatus === "PASSED"
      ? "COMPLETED"
      : validationStatus === "BLOCKED"
        ? "QUARANTINED"
        : "NEEDS_REVIEW";
  return { warningCount, blockingCount, validationStatus, nextJobStatus };
}

const INBOX_FOLDER = "01_INBOX";
const ORIGINALS_FOLDER = "originals";
/** Tên tệp trong kho do máy chủ đặt (`{documentType}-{timestamp}-{uuid8}.{ext}`), không có ký tự nào ngoài tập này. */
const SERVER_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

/**
 * Dựng đường dẫn ảnh cục bộ và chặn mọi lối thoát khỏi thư mục `originals` của đúng hồ sơ. Hôm nay
 * `public_files.file_name` do máy chủ sinh nên không có `..` hay separator lọt vào được; kiểm ở đây
 * để nếu sau này cách đặt tên đổi thì script không âm thầm đọc file ngoài phạm vi.
 */
export function resolveManifestFilePath(
  driveRoot: string,
  submissionId: string,
  fileName: string,
): string {
  if (!SERVER_FILE_NAME_PATTERN.test(fileName)) {
    throw new Error("Tên tệp không đúng dạng máy chủ đặt; không mở.");
  }
  if (!SERVER_FILE_NAME_PATTERN.test(submissionId)) {
    throw new Error("Mã hồ sơ không đúng dạng; không mở.");
  }
  if (!ALLOWED_IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase())) {
    throw new Error("Phần mở rộng tệp không thuộc danh sách ảnh được phép; không mở.");
  }
  const inbox = path.resolve(driveRoot, INBOX_FOLDER);
  const originals = path.resolve(inbox, submissionId, ORIGINALS_FOLDER);
  const filePath = path.resolve(originals, fileName);
  if (!originals.startsWith(inbox + path.sep) || !filePath.startsWith(originals + path.sep)) {
    throw new Error("Đường dẫn ảnh nằm ngoài thư mục hồ sơ; không mở.");
  }
  return filePath;
}

/**
 * Nhãn trường định danh cá nhân trong phần ghi chú tự do. Trích xuất GCN không bao giờ cần tới
 * chúng, nên xuất hiện ở đây nghĩa là model đã ghi thứ nằm ngoài phạm vi — fail-closed như nhánh
 * quét chuỗi giống CCCD. Danh sách bắt theo **nhãn**, không bắt được tên người viết trần; ranh giới
 * thật vẫn là quy tắc trong `agent/AGENTS.md` và việc cán bộ đọc lại ghi chú.
 */
const PERSONAL_INFO_MARKERS: readonly RegExp[] = [
  /ho\s+(va\s+)?ten/i,
  /ngay\s+sinh/i,
  /nam\s+sinh/i,
  /gioi\s+tinh/i,
  /dia\s+chi/i,
  /thuong\s+tru/i,
  /so\s+dinh\s+danh/i,
  /\bcccd\b/i,
  /\bcmnd\b/i,
];

/** Bỏ dấu để một danh sách mẫu bắt được cả "địa chỉ" lẫn "dia chi". */
function foldDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d");
}

/** Trả về đường dẫn các trường ghi chú có dấu hiệu chứa thông tin định danh cá nhân. */
export function findPersonalInfoInFreeText(payload: AiExtractionPayload): string[] {
  const fields: readonly [string, string][] = [
    ["quality.note", payload.quality.note],
    ...(["issueNumber", "issueDate", "registryNumber"] as const).flatMap((key) => {
      const evidence = payload.certificate[key].evidence;
      return evidence
        ? ([
            [`certificate.${key}.evidence.pageLabel`, evidence.pageLabel],
            [`certificate.${key}.evidence.note`, evidence.note],
          ] as [string, string][])
        : [];
    }),
  ];
  return fields
    .filter(([, text]) => {
      const folded = foldDiacritics(text);
      return PERSONAL_INFO_MARKERS.some((marker) => marker.test(folded));
    })
    .map(([fieldPath]) => fieldPath);
}

export interface StoredLocalResult {
  readonly resultId: string;
  readonly resultVersion: number;
  readonly validationStatus: string;
  readonly warningCount: number;
  readonly blockingCount: number;
}

/**
 * `request_log.response_json` là ranh giới tin cậy y như bên replay upload: một dòng hỏng không được
 * biến thành kết quả replay hợp lệ. Trả `null` để nơi gọi báo lỗi thay vì ghi đè bản ghi cũ.
 */
export function parseStoredLocalResult(value: unknown): StoredLocalResult | null {
  const raw: unknown = typeof value === "string" ? safeJsonParse(value) : value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.resultId !== "string" || !record.resultId) return null;
  if (!Number.isInteger(record.resultVersion) || (record.resultVersion as number) < 1) return null;
  if (
    record.validationStatus !== "PASSED" &&
    record.validationStatus !== "REVIEW_REQUIRED" &&
    record.validationStatus !== "BLOCKED"
  ) {
    return null;
  }
  if (!Number.isInteger(record.warningCount) || (record.warningCount as number) < 0) return null;
  if (!Number.isInteger(record.blockingCount) || (record.blockingCount as number) < 0) return null;
  return {
    resultId: record.resultId,
    resultVersion: record.resultVersion as number,
    validationStatus: record.validationStatus,
    warningCount: record.warningCount as number,
    blockingCount: record.blockingCount as number,
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
