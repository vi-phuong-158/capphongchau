import type { UserRole } from "@/modules/common/domain";

/** Bản ghi allowlist tối thiểu của sheet USERS. */
export interface UserReference {
  readonly email: string;
  readonly roles: readonly UserRole[];
  readonly active: boolean;
}
