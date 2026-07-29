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

/**
 * Ai được **lập hồ sơ hộ người dân** ở `/ke-khai-ho`.
 *
 * Không dùng chung `SUBMISSION_READ_ROLES`: đó là quyền *đọc* hàng đợi hồ sơ, còn đây là quyền
 * *tạo dữ liệu mới* mang dấu vết "cán bộ đã nhập hộ" — một hồ sơ do cán bộ nhập được coi là đáng
 * tin hơn hồ sơ hộ dân tự khai, nên quyền tạo nó phải hẹp hơn quyền xem.
 *
 * Cụ thể `REVIEW_OFFICER` bị loại: vai trò đó *thẩm định* hồ sơ. Cho cùng một người vừa nhập vừa
 * duyệt là bỏ mất chốt kiểm tra chéo duy nhất trong quy trình. `POPULATION_MATCH_OFFICER`,
 * `REPORT_VIEWER`, `AUDITOR` không nằm trong danh sách đọc từ đầu và cũng không thuộc nghiệp vụ
 * tiếp nhận.
 *
 * **Giả định** (mã nguồn không mô tả nghiệp vụ chi tiết hơn): `INTAKE_OFFICER` là cán bộ tiếp
 * nhận tại bộ phận một cửa, tức đúng nhóm "anh em đi làm cho dân" trong góp ý. Hai vai trò quản
 * trị giữ lại để phường không bị khóa cứng khi cần xử lý ngoại lệ. Nếu nghiệp vụ chốt khác, sửa
 * đúng hằng số này — cả trang lẫn API đều đọc từ đây, không có bản sao thứ hai.
 */
export const ASSISTED_INTAKE_ROLES = [
  UserRole.INTAKE_OFFICER,
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

/**
 * Trạng thái nào còn nhận xử lý được.
 *
 * **[2026-07-29] Đợt 2A-3 — thêm `NEEDS_SUPPLEMENT`.** Luồng "yêu cầu bổ sung" đã bỏ ở 2A-1, nên
 * không hồ sơ mới nào vào được trạng thái này nữa; nhưng hồ sơ **cũ** đang nằm đó thì trước bản
 * sửa này bị kẹt vĩnh viễn: cán bộ không claim được (hàm này từ chối), không sửa được
 * (`mayStaffEdit` đòi `UNDER_REVIEW`), và đường thoát duy nhất — người dân bấm gửi lại — vừa bị
 * chặn ở `isEditable` cùng đợt. Cho claim là cách đưa chúng về đúng luồng mới: nhận xử lý → sửa
 * trực tiếp ở Bàn làm việc → Hoàn thành xử lý.
 *
 * Hồ sơ `NEEDS_SUPPLEMENT` cũ thường vẫn còn `claimed_by` của cán bộ đã yêu cầu bổ sung; route
 * CLAIM đã chặn sẵn người khác cướp hồ sơ (403 `Hồ sơ đang do cán bộ khác nhận xử lý`) và quản
 * trị viên vẫn dùng được FORCE_CLAIM, nên mở trạng thái này không mở thêm lối vào nào.
 */
export function mayClaim(status: PublicStatus): boolean {
  return status === "SUBMITTED" || status === "RESUBMITTED" || status === "NEEDS_SUPPLEMENT";
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
