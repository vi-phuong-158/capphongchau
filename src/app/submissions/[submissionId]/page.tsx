import { randomUUID } from "node:crypto";

import { notFound, redirect } from "next/navigation";
import { SubmissionDetail } from "@/components/submission-detail";
import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { SUBMISSION_READ_ROLES } from "@/modules/submissions/review";
import { loadSubmissionDetail } from "@/modules/submissions/detail-view";
import type { SubmissionDetailView } from "@/modules/submissions/detail-view";
import { UserRole } from "@/modules/common/domain";
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
 *   1. **Audit** — `loadSubmissionDetail` ghi `SUBMISSION_SENSITIVE_DETAIL_VIEWED`. Nếu tự dựng
 *      dữ liệu tại đây thay vì gọi hàm dùng chung thì dấu vết "ai đã xem hồ sơ nào" sẽ mất.
 *   2. **Không cache** — HTML giờ chứa PII (số điện thoại, CCCD, địa chỉ) chứ không còn là khung
 *      rỗng. `dynamic = "force-dynamic"` bỏ cache của Next, và `src/proxy.ts` gắn
 *      `cache-control: private, no-store` cho mọi đường dẫn cán bộ để proxy trung gian không giữ
 *      lại bản HTML này.
 *
 * Nếu nạp sẵn thất bại vì lỗi tạm (mất kết nối cơ sở dữ liệu), trang vẫn render với
 * `initialSubmission={null}` và component client tự fetch như trước — không làm cán bộ mất trang.
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

  let initialSubmission: SubmissionDetailView | null = null;
  let missing = false;
  try {
    initialSubmission = await loadSubmissionDetail(submissionId, user, randomUUID());
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
