import type { ValidationIssue } from "../../../scripts/ai/validator";

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
