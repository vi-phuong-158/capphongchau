import type { UserRole } from "@/modules/common/domain";

export {
  getGoogleSheetsUserRepository,
  GoogleSheetsUserRepository,
  IdempotencyConflictError,
  UserAlreadyExistsError,
  type ActiveUser,
  type ManagedUser,
  type UserMutation,
} from "./google-sheets-user-repository";

/** Bản ghi allowlist tối thiểu của sheet USERS. */
export interface UserReference {
  readonly email: string;
  readonly roles: readonly UserRole[];
  readonly active: boolean;
}
