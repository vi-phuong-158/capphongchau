/**
 * Cách hiển thị "cán bộ tiếp nhận" ở hai nơi có mức lộ thông tin khác nhau.
 *
 * Câu hỏi của cán bộ đi thu hồ sơ là "Cán bộ tiếp nhận là ai?". Trả lời được câu đó ở màn hình
 * quản trị là chuyện nội bộ; trả lời ở cổng công khai thì phải cẩn thận: **email công vụ của cán
 * bộ không được đưa ra ngoài**, vì đó là địa chỉ thật có thể bị thu thập để lừa đảo hoặc gửi thư
 * rác nhân danh phường.
 */

import type { PublicStatus } from "@/modules/public-intake/workflow";

export interface AssignedOfficerSource {
  readonly claimedBy: string;
  readonly claimedByDisplayName: string;
}

/**
 * Nhãn cho màn hình quản trị: ưu tiên tên, lùi về email với hồ sơ nhận trước khi có cột tên.
 *
 * Cán bộ nội bộ vẫn cần thấy email để biết chính xác tài khoản nào, nên email hiển thị ở dòng phụ
 * (`assignedOfficerAccount`), không thay cho tên.
 */
export function assignedOfficerLabel(record: AssignedOfficerSource): string {
  const name = record.claimedByDisplayName.trim();
  if (name) return name;
  const email = record.claimedBy.trim();
  return email || "Chưa nhận";
}

/** Dòng phụ trên màn hình quản trị; rỗng khi chưa ai nhận hoặc khi tên chính là email. */
export function assignedOfficerAccount(record: AssignedOfficerSource): string {
  const email = record.claimedBy.trim();
  if (!email) return "";
  return record.claimedByDisplayName.trim() ? email : "";
}

/**
 * Các trạng thái mà hồ sơ **đang** được một cán bộ xử lý.
 *
 * Ngoài các trạng thái này thì không có ai đang cầm hồ sơ, nên không hiển thị tên ai cả — kể cả
 * khi cột `claimed_by` còn giá trị cũ.
 */
const ACTIVE_ASSIGNMENT_STATUSES: ReadonlySet<PublicStatus> = new Set<PublicStatus>([
  "UNDER_REVIEW",
  "NEEDS_SUPPLEMENT",
  "RESUBMITTED",
  "ACCEPTING",
]);

/**
 * Thông tin cán bộ trả ra **cổng công khai**.
 *
 * Chỉ trả tên, không bao giờ trả email. Hồ sơ cũ chưa có tên thì trả `null` và giao diện hiển thị
 * "Đã phân công cán bộ" — biết là đã có người xử lý, mà không lộ địa chỉ thư nào.
 */
export function publicAssignedOfficer(
  record: AssignedOfficerSource & { readonly status: PublicStatus },
): { displayName: string } | null {
  if (!ACTIVE_ASSIGNMENT_STATUSES.has(record.status)) return null;
  if (!record.claimedBy.trim()) return null;
  const name = record.claimedByDisplayName.trim();
  return name ? { displayName: name } : null;
}

/** Đã phân công nhưng chưa biết tên (hồ sơ cũ) — dùng để hiển thị câu thay thế an toàn. */
export function publicHasAssignedOfficer(
  record: AssignedOfficerSource & { readonly status: PublicStatus },
): boolean {
  return ACTIVE_ASSIGNMENT_STATUSES.has(record.status) && record.claimedBy.trim().length > 0;
}
