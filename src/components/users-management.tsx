"use client";

import { useState } from "react";

import { UserRole } from "@/modules/common/domain";
import type { ManagedUser } from "@/modules/users";

interface Props {
  readonly initialUsers: readonly ManagedUser[];
}

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/security/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error("Phiên đăng nhập đã hết hạn.");
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

async function updateUser(method: "POST" | "PATCH", body: object): Promise<ManagedUser> {
  const token = await csrfToken();
  const response = await fetch("/api/users", {
    method,
    headers: {
      "content-type": "application/json",
      "x-csrf-token": token,
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Không thể lưu thay đổi người dùng.");
  return ((await response.json()) as { user: ManagedUser }).user;
}

export function UsersManagement({ initialUsers }: Props) {
  const [users, setUsers] = useState<readonly ManagedUser[]>(initialUsers);
  const [message, setMessage] = useState<string | null>(null);

  async function createUser(formData: FormData) {
    setMessage(null);
    try {
      const created = await updateUser("POST", {
        email: formData.get("email"),
        displayName: formData.get("displayName"),
        roles: [formData.get("role")],
        active: true,
      });
      setUsers((current) => [...current, created]);
      setMessage("Đã thêm người dùng vào allowlist.");
    } catch {
      setMessage("Không thể thêm người dùng. Hãy kiểm tra lại phiên đăng nhập và dữ liệu.");
    }
  }

  async function toggleUser(user: ManagedUser) {
    setMessage(null);
    try {
      const updated = await updateUser("PATCH", { email: user.email, active: !user.active });
      setUsers((current) =>
        current.map((candidate) => (candidate.email === updated.email ? updated : candidate)),
      );
      setMessage(updated.active ? "Đã mở khóa người dùng." : "Đã khóa người dùng.");
    } catch {
      setMessage("Không thể cập nhật trạng thái người dùng.");
    }
  }

  return (
    <div className="space-y-8">
      <form
        action={createUser}
        className="grid gap-3 rounded-xl border border-stone-200 p-5 sm:grid-cols-2"
      >
        <input
          aria-label="Email"
          className="rounded-lg border border-stone-300 px-3 py-2"
          name="email"
          placeholder="email cán bộ"
          required
          type="email"
        />
        <input
          aria-label="Tên hiển thị"
          className="rounded-lg border border-stone-300 px-3 py-2"
          name="displayName"
          placeholder="Tên hiển thị"
          required
        />
        <select
          aria-label="Vai trò"
          className="rounded-lg border border-stone-300 px-3 py-2"
          defaultValue={UserRole.INTAKE_OFFICER}
          name="role"
        >
          {Object.values(UserRole).map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <button
          className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white"
          type="submit"
        >
          Thêm người dùng
        </button>
      </form>
      {message ? (
        <p aria-live="polite" className="text-sm text-stone-700">
          {message}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-stone-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-100 text-stone-700">
            <tr>
              <th className="p-3">Người dùng</th>
              <th className="p-3">Vai trò</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr className="border-t border-stone-200" key={user.email}>
                <td className="p-3">
                  <div>{user.displayName}</div>
                  <div className="text-stone-500">{user.email}</div>
                </td>
                <td className="p-3">{user.roles.join(", ")}</td>
                <td className="p-3">{user.active ? "Đang hoạt động" : "Đã khóa"}</td>
                <td className="p-3">
                  <button
                    className="rounded-md border border-stone-300 px-3 py-1.5"
                    onClick={() => toggleUser(user)}
                    type="button"
                  >
                    {user.active ? "Khóa" : "Mở khóa"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
