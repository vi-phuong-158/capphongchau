import { notFound, redirect } from "next/navigation";
import { SubmissionDetail } from "@/components/submission-detail";
import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { SUBMISSION_READ_ROLES } from "@/modules/submissions/review";
import { UserRole } from "@/modules/common/domain";
import { loadStaffSubmissionDetail } from "@/modules/submissions/detail";
export const dynamic = "force-dynamic";

const ADMINISTRATOR_ROLES = [UserRole.WARD_ADMIN, UserRole.SYSTEM_ADMIN];

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
  const initialSubmission = await loadStaffSubmissionDetail({
    submissionId,
    actorEmail: user.email,
    canResetAccessSecret: isAdministrator,
    auditDetailView: true,
  });
  if (!initialSubmission) notFound();
  return (
    <SubmissionDetail
      initialSubmission={initialSubmission}
      currentUserEmail={user.email}
      isAdministrator={isAdministrator}
    />
  );
}
