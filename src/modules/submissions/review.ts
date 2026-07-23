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
  return status === "SUBMITTED" || status === "RESUBMITTED" || status === "UNDER_REVIEW";
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
 * Chủ sử dụng đã quét QR CCCD thật (`identityStatus === "QR_CONFIRMED"`) có thông tin định danh
 * đọc trực tiếp từ chip — cán bộ không được sửa. Chỉ chủ nhập tay (`MANUAL`/chưa xác nhận) mới
 * cho sửa, đúng phạm vi "sửa lỗi gõ phím" đã chốt.
 */
export function isOwnerIdentityLocked(identityStatus: string): boolean {
  return identityStatus === "QR_CONFIRMED";
}
