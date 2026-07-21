import type { UserRole } from "@/modules/common/domain";

/** Người dùng đã đăng nhập; quyền cụ thể sẽ được đối chiếu từ sheet USERS ở M2. */
export interface AuthenticatedUser {
  readonly email: string;
  readonly roles: readonly UserRole[];
}
