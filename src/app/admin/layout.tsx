import Link from "next/link";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

import { requireActiveUser } from "@/modules/auth/authorization";
import { UserRole } from "@/modules/common/domain";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  let user;
  try {
    user = await requireActiveUser();
  } catch {
    redirect("/");
  }

  const isSystemAdmin = user.roles.includes(UserRole.SYSTEM_ADMIN);

  return (
    <div className="flex min-h-screen bg-[#f7f5f3]">
      <aside className="w-64 bg-white border-r border-stone-200 flex flex-col shadow-sm">
        <div className="h-16 flex items-center px-6 border-b border-stone-100">
          <span className="font-bold text-cherry-700 tracking-wider">PHONG CHÂU</span>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          <Link
            href="/admin/dashboard"
            className="flex items-center px-3 py-2.5 text-sm font-medium rounded-md text-cherry-900 bg-cherry-50"
          >
            <svg
              className="w-5 h-5 mr-3 text-cherry-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Tổng quan
          </Link>
          <Link
            href="/submissions"
            className="flex items-center px-3 py-2.5 text-sm font-medium rounded-md text-stone-700 hover:text-stone-900 hover:bg-stone-50 transition-colors"
          >
            <svg
              className="w-5 h-5 mr-3 text-stone-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Hàng chờ
          </Link>
          {isSystemAdmin && (
            <Link
              href="/users"
              className="flex items-center px-3 py-2.5 text-sm font-medium rounded-md text-stone-700 hover:text-stone-900 hover:bg-stone-50 transition-colors"
            >
              <svg
                className="w-5 h-5 mr-3 text-stone-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Quản trị người dùng
            </Link>
          )}
        </nav>
        <div className="p-4 border-t border-stone-100">
          <Link
            href="/profile"
            className="flex items-center gap-3 text-sm font-medium text-stone-700 hover:text-stone-900"
          >
            <div className="w-8 h-8 rounded-full bg-cherry-100 flex items-center justify-center text-cherry-700 font-bold">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="truncate flex-1">
              <div className="truncate">{user.displayName}</div>
              <div className="text-xs font-normal text-stone-500 truncate">{user.email}</div>
            </div>
          </Link>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
