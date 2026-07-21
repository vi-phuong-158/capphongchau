import { redirect } from "next/navigation";
import { SubmissionDetail } from "@/components/submission-detail";
import { AuthorizationError, requireActiveUser } from "@/modules/auth/authorization";
import { SUBMISSION_READ_ROLES } from "@/modules/submissions/review";
export const dynamic = "force-dynamic";
export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  try {
    await requireActiveUser(SUBMISSION_READ_ROLES);
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/profile");
    throw error;
  }
  const { submissionId } = await params;
  return <SubmissionDetail submissionId={submissionId} />;
}
