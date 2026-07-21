import type { UserRole } from "@/modules/common/domain";

/** Người dùng đã đăng nhập; role luôn được đối chiếu lại từ sheet USERS ở server. */
export interface AuthenticatedUser {
  readonly email: string;
  readonly roles: readonly UserRole[];
}
