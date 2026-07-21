import { redirect } from "next/navigation";

import { UsersManagement } from "@/components/users-management";
import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { UserRole } from "@/modules/common/domain";
import { getGoogleSheetsUserRepository } from "@/modules/users";

export const dynamic = "force-dynamic";

async function loadUsers() {
  try {
    await requireActiveUser([UserRole.SYSTEM_ADMIN]);
    return await getGoogleSheetsUserRepository().list();
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/");
    throw error;
  }
}

export default async function UsersPage() {
  const users = await loadUsers();
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-16">
      <a className="text-sm font-semibold text-emerald-800" href="/profile">
        ← Hồ sơ cá nhân
      </a>
      <h1 className="mt-5 text-3xl font-bold tracking-tight text-stone-950">Quản trị người dùng</h1>
      <p className="mt-2 max-w-2xl text-stone-700">
        Chỉ email trong danh sách này, đang hoạt động, mới được truy cập hệ thống sau khi đăng nhập
        Google.
      </p>
      <div className="mt-8">
        <UsersManagement initialUsers={users} />
      </div>
    </main>
  );
}
