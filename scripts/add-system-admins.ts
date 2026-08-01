import { createHash, randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { UserRole } from "../src/modules/common/domain";
import { getDatabase } from "../src/modules/supabase/database";

loadEnvConfig(process.cwd());

const ADMIN_USERS = [
  {
    email: "vdl.0595@gmail.com",
    displayName: "Quản trị viên vdl.0595",
  },
  {
    email: "thanhson2311@gmail.com",
    displayName: "Quản trị viên thanhson2311",
  },
] as const;

function entityHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

async function addSystemAdmins(): Promise<void> {
  const db = getDatabase();

  console.log("Đang khởi tạo kết nối Supabase PostgreSQL...");

  for (const admin of ADMIN_USERS) {
    const email = admin.email.trim().toLowerCase();
    const roles = [UserRole.SYSTEM_ADMIN];
    const active = true;
    const displayName = admin.displayName;
    const targetHash = entityHash(email);
    const requestId = randomUUID();

    await db.begin(async (tx) => {
      // Upsert user in public.users
      await tx`
        insert into public.users (email, roles, active, display_name)
        values (
          ${email},
          ${tx.array(roles)},
          ${active},
          ${displayName}
        )
        on conflict (email) do update set
          roles = excluded.roles,
          active = excluded.active,
          display_name = excluded.display_name,
          updated_at = now()
      `;

      // Log audit
      await tx`
        insert into public.audit_logs (
          audit_id, actor_email, action, entity_type, entity_id, request_id, metadata
        ) values (
          ${randomUUID()}, 'CLI_SCRIPT', 'USER_ADDED_SYSTEM_ADMIN', 'USER', ${targetHash},
          ${requestId},
          ${tx.json({
            targetEmail: email,
            roles,
            active,
          })}
        )
      `;

      console.log(`✅ Đã thêm/cập nhật thành công SYSTEM_ADMIN: ${email} (${displayName})`);
    });
  }

  console.log("\nHoàn tất thêm danh sách SYSTEM_ADMIN.");
  process.exit(0);
}

addSystemAdmins().catch((error) => {
  console.error("❌ Lỗi khi thêm SYSTEM_ADMIN:", error);
  process.exit(1);
});
