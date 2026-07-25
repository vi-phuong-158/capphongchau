import { UserRole } from "@/modules/common/domain";
import type { PublicStatus, SubmissionRecord } from "@/modules/public-intake/repository";

export const SUBMISSION_READ_ROLES = [
  UserRole.INTAKE_OFFICER,
  UserRole.REVIEW_OFFICER,
  UserRole.WARD_ADMIN,
  UserRole.SYSTEM_ADMIN,
] as const;

export const SUBMISSION_DECISION_ROLES = [
  UserRole.REVIEW_OFFICER,
  UserRole.WARD_ADMIN,
  UserRole.SYSTEM_ADMIN,
] as const;

export function maskPhone(phone: string): string {
  if (phone.length < 5) return "••••";
  return `${phone.slice(0, 2)}••••${phone.slice(-2)}`;
}

export function isClaimedBy(record: SubmissionRecord, email: string): boolean {
  return record.claimedBy.trim().toLowerCase() === email.trim().toLowerCase();
}

export function mayClaim(status: PublicStatus): boolean {
  return status === "SUBMITTED" || status === "RESUBMITTED";
}

export function mayForceClaim(roles: readonly string[]): boolean {
  return roles.includes(UserRole.WARD_ADMIN) || roles.includes(UserRole.SYSTEM_ADMIN);
}

export function mayRelease(
  record: SubmissionRecord,
  email: string,
  roles: readonly string[],
): boolean {
  return isClaimedBy(record, email) || mayForceClaim(roles);
}

export function mayTransfer(
  record: SubmissionRecord,
  email: string,
  roles: readonly string[],
): boolean {
  return isClaimedBy(record, email) || mayForceClaim(roles);
}

export function mayRequestSupplement(record: SubmissionRecord, email: string): boolean {
  return isClaimedBy(record, email) && record.status === "UNDER_REVIEW";
}

export function mayReject(record: SubmissionRecord, email: string): boolean {
  return mayRequestSupplement(record, email);
}

export function mayStaffEdit(record: SubmissionRecord, email: string): boolean {
  return isClaimedBy(record, email) && record.status === "UNDER_REVIEW";
}

/**
 * Điều chỉnh hồ sơ ĐÃ tiếp nhận chính thức.
 *
 * Khác `mayStaffEdit` ở ba điểm, và cả ba đều có lý do:
 *   - Chỉ áp dụng khi hồ sơ đã `ACCEPTED` **và** đã có mã hồ sơ chính thức. Không có `case_id` thì
 *     không có gì để đồng bộ lại, và việc sửa lúc đó thuộc luồng thường.
 *   - Cho phép cả quản trị viên, không chỉ người đang giữ hồ sơ: sau khi tiếp nhận xong, cán bộ
 *     nhận hồ sơ có thể đã nghỉ/chuyển việc, mà sai sót trên hồ sơ chính thức thì phải sửa được.
 *   - Bên gọi BẮT BUỘC kèm lý do điều chỉnh (`amendmentReason`) — đó là dấu vết đối soát duy nhất
 *     giải thích vì sao dữ liệu chính thức đổi sau khi đã chốt.
 *
 * Quyết định [2026-07-25] Q2: cán bộ được sửa, cán bộ là người quyết định cuối cùng.
 */
export function mayAmendOfficialRecord(
  record: SubmissionRecord,
  email: string,
  isAdministrator: boolean,
): boolean {
  return (
    record.status === "ACCEPTED" &&
    record.officialCaseId.trim().length > 0 &&
    (isClaimedBy(record, email) || isAdministrator)
  );
}

/**
 * Thông tin định danh của chủ này được đọc thẳng từ chip CCCD qua QR, không phải người dân gõ tay.
 *
 * **[2026-07-25] Đây là CẢNH BÁO, không còn là khóa cứng.** Trước đó hàm này chặn cán bộ sửa mọi
 * trường định danh của chủ `QR_CONFIRMED`. Chủ dự án quyết định cán bộ được sửa toàn bộ trường và
 * là người quyết định cuối cùng (03-decisions.md [2026-07-25] Q1) — lý do: QR đọc nhầm hoặc bìa
 * ghi khác thẻ thì hồ sơ bế tắc, không có đường đi tiếp.
 *
 * Đổi lại, mỗi lần cán bộ ghi đè một trường `QR_CONFIRMED` phải để lại dấu vết riêng trong
 * `audit_logs` (`identityOverride: true`) — chip đáng tin hơn mắt người, nên việc đi ngược lại nó
 * cần tra lại được.
 */
export function isOwnerIdentityQrConfirmed(identityStatus: string): boolean {
  return identityStatus === "QR_CONFIRMED";
}
