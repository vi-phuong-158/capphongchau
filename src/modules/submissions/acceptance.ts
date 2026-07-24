import type { PublicStatus, SubmissionRecord } from "@/modules/public-intake/repository";

/**
 * Các mốc bền vững của một lần tiếp nhận. Mỗi mốc phải được ghi vào
 * `PUBLIC_SUBMISSIONS.accept_step` trước khi đi sang hệ thống bên ngoài tiếp theo,
 * để retry không sinh CASE hoặc di chuyển tệp lần hai.
 */
export const OFFICIAL_ACCEPTANCE_STEPS = [
  "",
  "CLAIMED",
  "ID_RESERVED",
  "CASE_FOLDER_READY",
  "FILES_MOVED",
  "RECORDS_WRITTEN",
  "COMPLETED",
] as const;

export type OfficialAcceptanceStep = (typeof OFFICIAL_ACCEPTANCE_STEPS)[number];

export const OFFICIAL_ACCEPTANCE_CATALOG_MESSAGE =
  "Chưa thể tiếp nhận chính thức vì danh mục mã trường 12 chưa được phê duyệt và nhập vào hệ thống.";

/**
 * Hard stop ĐỘC LẬP với `REFERENCE_IS_PLACEHOLDER` (reference.ts). Hai cờ đó phục vụ hai câu hỏi
 * khác nhau: `REFERENCE_IS_PLACEHOLDER` hỏi "nhãn danh mục dùng để xuất PL3 đã chốt chưa" (đã chốt
 * 2026-07-23, xem 03-decisions.md), còn cờ này hỏi "đã đủ điều kiện ghi CASE/di chuyển file Drive
 * thật cho dữ liệu thật chưa". Dùng chung một cờ cho hai câu hỏi từng khiến saga bị mở khóa ngoài ý
 * muốn khi cờ kia bị đảo vì lý do export — xem 03-decisions.md [2026-07-24].
 *
 * Chỉ đảo `true` sau khi hoàn thành TOÀN BỘ điều kiện gác cổng ở
 * `docs/brain/04-current-tasks.md` mục "Chặn trước khi đưa cổng công khai vào dữ liệu thật":
 * diễn tập staging 3 kịch bản saga, thông báo bảo vệ dữ liệu thật, tắt
 * `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE` + bật security headers, và khớp tổ chức trong tra cứu GCN.
 */
export const OFFICIAL_ACCEPTANCE_ENABLED = false;

export const OFFICIAL_ACCEPTANCE_DISABLED_MESSAGE =
  "Saga tiếp nhận chính thức chưa được mở cho dữ liệu thật — đang chờ diễn tập staging và các điều kiện gác cổng khác.";

export function canStartOfficialAcceptance(
  record: SubmissionRecord,
  actorEmail: string,
  isAdministrator: boolean,
): boolean {
  const claimedByActor = record.claimedBy.trim().toLowerCase() === actorEmail.trim().toLowerCase();
  return (
    record.status === "UNDER_REVIEW" &&
    (claimedByActor || isAdministrator) &&
    record.officialCaseId.length === 0
  );
}

export function isAcceptanceInProgress(status: PublicStatus): boolean {
  return status === "ACCEPTING";
}

/** Năm nghiệp vụ luôn theo giờ Việt Nam, độc lập timezone của Vercel. */
export function vietnamBusinessYear(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
  }).format(now);
}

export function formatOfficialCaseId(year: string, sequence: number): string {
  if (!/^\d{4}$/.test(year) || !Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Không thể tạo mã hồ sơ chính thức.");
  }
  return `PHONGCHAU-${year}-${String(sequence).padStart(6, "0")}`;
}
