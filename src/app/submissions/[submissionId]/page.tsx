import { randomUUID } from "node:crypto";

import { notFound, redirect } from "next/navigation";
import { SubmissionDetail } from "@/components/submission-detail";
import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { SUBMISSION_READ_ROLES } from "@/modules/submissions/review";
import { UserRole } from "@/modules/common/domain";
import { loadStaffSubmissionDetail } from "@/modules/submissions/detail";
import type { StaffSubmissionDetail } from "@/modules/submissions/detail-types";

export const dynamic = "force-dynamic";

const ADMINISTRATOR_ROLES = [UserRole.WARD_ADMIN, UserRole.SYSTEM_ADMIN];

/**
 * Trang này **nạp sẵn hồ sơ ngay trên server** (server-priming) rồi truyền xuống component client.
 * Trước đó `SubmissionDetail` tự gọi `GET /api/submissions/:id` sau khi hydrate, nên cán bộ phải
 * chờ thêm một vòng: HTML → tải JS → hydrate → fetch → mới thấy dữ liệu. Nạp trên server bỏ hẳn
 * vòng đó và bỏ luôn một lần xác thực + một lần đọc hồ sơ trùng lặp.
 *
 * Hai điều kiện phải giữ khi làm việc này, đừng gỡ:
 *
 *   1. **Audit** — `loadStaffSubmissionDetail` ghi `SUBMISSION_SENSITIVE_DETAIL_VIEWED`. Nếu tự dựng
 *      dữ liệu tại đây thay vì gọi hàm dùng chung thì dấu vết "ai đã xem hồ sơ nào" sẽ mất.
 *   2. **Không cache** — HTML giờ chứa PII (số điện thoại, CCCD, địa chỉ) chứ không còn là khung
 *      rỗng. `dynamic = "force-dynamic"` bỏ cache của Next, và `src/proxy.ts` gắn
 *      `cache-control: private, no-store` cho mọi đường dẫn cán bộ để proxy trung gian không giữ
 *      lại bản HTML này.
 *
 * Hai nhánh lỗi **không được lẫn vào nhau**: hàm nạp trả `null` = không có hồ sơ (hoặc ngoài quyền
 * đọc) → `notFound()`; hàm **ném lỗi** = sự cố tạm (mất kết nối cơ sở dữ liệu) → vẫn render với
 * `initialSubmission={null}` để component client tự fetch. Đảo hai nhánh này làm cán bộ thấy "không
 * tìm thấy hồ sơ" khi cơ sở dữ liệu chỉ chớp tắt một nhịp.
 */
export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  let user;
  try {
    user = await requireActiveUser(SUBMISSION_READ_ROLES);
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/profile");
    throw error;
  }
  const { submissionId } = await params;
  const isAdministrator = user.roles.some((role) => ADMINISTRATOR_ROLES.includes(role as UserRole));

  let initialSubmission: StaffSubmissionDetail | null = null;
  let missing = false;
  try {
    initialSubmission = await loadStaffSubmissionDetail({
      submissionId,
      actorEmail: user.email,
      canResetAccessSecret: isAdministrator,
      auditDetailView: true,
      requestId: randomUUID(),
    });
    missing = initialSubmission === null;
  } catch {
    // Lỗi tạm khi nạp sẵn không được làm chết trang: để client tự fetch và tự báo lỗi.
    initialSubmission = null;
  }
  if (missing) notFound();

  return (
    <SubmissionDetail
      submissionId={submissionId}
      currentUserEmail={user.email}
      isAdministrator={isAdministrator}
      initialSubmission={initialSubmission}
    />
  );
}
