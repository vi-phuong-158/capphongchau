/**
 * Logic thuần cho `scripts/audit-orphan-public-files.ts` — tách riêng để test được mà không cần
 * Postgres/Google Drive thật.
 */

import { createHash } from "node:crypto";

export type OrphanFindingKind = "DRIVE_ORPHAN" | "MISSING_ON_DRIVE" | "FOLDER_UNREADABLE";

export interface OrphanFinding {
  readonly kind: OrphanFindingKind;
  readonly submissionId: string;
  readonly driveFileId: string;
  readonly sizeBytes: number;
}

export interface AuditOptions {
  readonly apply: boolean;
  readonly confirm: string;
  readonly limit: number;
}

export function parseAuditOptions(argv: readonly string[]): AuditOptions {
  const limitArgument = argv.find((value) => value.startsWith("--limit="));
  return {
    // `--dry-run` được chấp nhận nhưng thừa: không có `--apply` thì luôn là chạy khô.
    apply: argv.includes("--apply"),
    confirm: argv.find((value) => value.startsWith("--confirm="))?.slice("--confirm=".length) ?? "",
    limit: limitArgument ? Number(limitArgument.slice("--limit=".length)) : 500,
  };
}

/**
 * Token xác nhận buộc người chạy phải đọc kết quả khô trước khi xóa.
 *
 * Gắn với đúng tập tệp sắp xóa: thêm hay bớt một tệp là token đổi, nên không thể lấy token của lần
 * chạy hôm qua để xóa tập của hôm nay.
 */
export function driveOrphanConfirmationToken(findings: readonly OrphanFinding[]): string {
  const material = findings
    .filter((item) => item.kind === "DRIVE_ORPHAN")
    .map((item) => `${item.submissionId}:${item.driveFileId}`)
    .sort()
    .join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}
