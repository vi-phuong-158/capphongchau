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
 * **[2026-07-25] ĐÃ MỞ theo quyết định của chủ dự án** — xem 03-decisions.md
 * [2026-07-25] "Mở tiếp nhận chính thức". Toàn bộ điều kiện gác cổng đã đóng:
 *
 * 1. Diễn tập staging 3 kịch bản saga — PASS 6/6 trên Postgres thử nghiệm (2026-07-24).
 * 2. Danh mục trường 12/13 — đã chốt từ dropdown PL3 (2026-07-22/2026-07-23).
 * 3. Thông báo bảo vệ dữ liệu, `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE`, khớp tổ chức trong tra cứu
 *    GCN — chủ dự án chấp nhận rủi ro có ghi nhận (2026-07-24).
 * 4. Điều khoản xử lý dữ liệu Gemini/Antigravity — chủ dự án quyết định thực hiện (2026-07-25).
 *
 * Hai lỗi chặn được vá cùng lượt mở cờ, vì nếu không thì hồ sơ chính thức đầu tiên đã hỏng:
 * - `refreshCanonicalProjection` xóa `public_parcels` trước `public_land_uses` → mọi lần cán bộ sửa
 *   hồ sơ đã gửi đều 500 (repository.ts).
 * - Bước `RECORDS_WRITTEN` không ghi thửa đất và mục đích sử dụng vào bảng chính thức nào
 *   (acceptance-saga.ts).
 *
 * Đảo lại `false` là công tắc dừng khẩn hợp lệ: hồ sơ đang dở nằm lại `ACCEPTING`, retry cùng
 * `idempotency-key` sẽ đi tiếp từ checkpoint khi mở lại. Không đảo về `false` một cách âm thầm —
 * `tests/submission-acceptance.test.ts` có trip-wire cho cả hai chiều.
 */
export const OFFICIAL_ACCEPTANCE_ENABLED = true;

export const OFFICIAL_ACCEPTANCE_DISABLED_MESSAGE =
  "Tiếp nhận chính thức đang tạm dừng. Hãy liên hệ quản trị viên trước khi thử lại.";

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
