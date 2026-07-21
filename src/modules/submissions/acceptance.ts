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
