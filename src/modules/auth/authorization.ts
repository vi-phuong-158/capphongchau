import { auth } from "@/auth";
import type { UserRole } from "@/modules/common/domain";
import { getUserRepository, type ActiveUser } from "@/modules/users/supabase-user-repository";

export class AuthorizationError extends Error {
  constructor(readonly kind: "UNAUTHENTICATED" | "ACCESS_DENIED") {
    super(
      kind === "UNAUTHENTICATED"
        ? "Bạn chưa đăng nhập."
        : "Bạn không có quyền thực hiện thao tác này.",
    );
    this.name = "AuthorizationError";
  }
}

export interface AuthorizedUser {
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly UserRole[];
}

export async function resolveActiveUser(email: string): Promise<ActiveUser | null> {
  return getUserRepository().findActiveByEmail(email);
}

export async function requireActiveUser(
  requiredRoles: readonly UserRole[] = [],
): Promise<AuthorizedUser> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    throw new AuthorizationError("UNAUTHENTICATED");
  }

  const user = await resolveActiveUser(email);
  if (!user) {
    throw new AuthorizationError("ACCESS_DENIED");
  }

  if (requiredRoles.length > 0 && !requiredRoles.some((role) => user.roles.includes(role))) {
    throw new AuthorizationError("ACCESS_DENIED");
  }

  return user;
}

export async function recordDeniedSignIn(email: string): Promise<void> {
  try {
    await getUserRepository().appendDeniedSignInAudit(email);
  } catch {
    // Quyền vẫn bị từ chối khi audit tạm thời không ghi được. Không lộ chi tiết lỗi Supabase.
  }
}
