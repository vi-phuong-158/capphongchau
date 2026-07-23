import type { UserRole } from "@/modules/common/domain";

export {
  getUserRepository,
  SupabaseUserRepository,
  IdempotencyConflictError,
  UserAlreadyExistsError,
  type ActiveUser,
  type ManagedUser,
  type UserMutation,
} from "./supabase-user-repository";

/** Bản ghi allowlist tối thiểu của bảng users trong Supabase. */
export interface UserReference {
  readonly email: string;
  readonly roles: readonly UserRole[];
  readonly active: boolean;
}
