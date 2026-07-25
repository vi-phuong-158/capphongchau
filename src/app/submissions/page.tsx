import { redirect } from "next/navigation";

import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { SUBMISSION_READ_ROLES } from "@/modules/submissions/review";
import { SubmissionsQueue } from "@/components/submissions-queue";
import { Pl3ExportButton } from "@/components/pl3-export-button";
import { UserRole } from "@/modules/common/domain";

export const dynamic = "force-dynamic";

const EXPORT_ROLES = [UserRole.REPORT_VIEWER, UserRole.WARD_ADMIN, UserRole.SYSTEM_ADMIN];

export default async function SubmissionsPage() {
  let user;
  try {
    user = await requireActiveUser(SUBMISSION_READ_ROLES);
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/profile");
    throw error;
  }

  const canExport = user.roles.some((role) => EXPORT_ROLES.includes(role as UserRole));

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-7">
        <p className="text-sm font-semibold text-emerald-800">PHƯỜNG PHONG CHÂU</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-950">
          Hàng chờ tiếp nhận
        </h1>
        <p className="mt-2 text-stone-600">
          Xem, nhận xử lý và kiểm tra bản kê khai người dân đã gửi.
        </p>
        {canExport ? (
          <div className="mt-4">
            <Pl3ExportButton />
          </div>
        ) : null}
      </div>
      <SubmissionsQueue />
    </main>
  );
}
