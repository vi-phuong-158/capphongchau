import { redirect } from "next/navigation";
import Link from "next/link";

import { signOut } from "@/auth";
import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { UserRole } from "@/modules/common/domain";

export const dynamic = "force-dynamic";

async function loadProfileUser() {
  try {
    return await requireActiveUser();
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/");
    throw error;
  }
}

export default async function ProfilePage() {
  const user = await loadProfileUser();
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section className="w-full space-y-6 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-[0.16em] text-emerald-800">
          PHƯỜNG PHONG CHÂU
        </p>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-950">Hồ sơ cá nhân</h1>
          <p className="mt-2 text-stone-700">{user.displayName || user.email}</p>
          <p className="text-sm text-stone-500">{user.email}</p>
        </div>
        <p className="rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-700">
          Vai trò: {user.roles.join(", ")}
        </p>
        {user.roles.includes(UserRole.SYSTEM_ADMIN) ? (
          <a
            className="inline-flex rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
            href="/users"
          >
            Quản trị người dùng
          </a>
        ) : null}
        {user.roles.some((role) =>
          [
            UserRole.INTAKE_OFFICER,
            UserRole.REVIEW_OFFICER,
            UserRole.WARD_ADMIN,
            UserRole.SYSTEM_ADMIN,
          ].includes(role),
        ) ? (
          <Link
            className="inline-flex rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
            href="/submissions"
          >
            Hàng chờ tiếp nhận
          </Link>
        ) : null}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800"
            type="submit"
          >
            Đăng xuất
          </button>
        </form>
      </section>
    </main>
  );
}
