import { redirect } from "next/navigation";

import { requireActiveUser } from "@/modules/auth/authorization";
import { getPublicIntakeRepository, type PublicStatus } from "@/modules/public-intake/repository";
import { SUBMISSION_READ_ROLES } from "@/modules/submissions/review";
import { DashboardClient } from "@/components/admin/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  try {
    await requireActiveUser(SUBMISSION_READ_ROLES);
  } catch {
    redirect("/");
  }

  const fromDate = typeof searchParams.from === "string" ? searchParams.from : undefined;
  const toDate = typeof searchParams.to === "string" ? searchParams.to : undefined;
  const officer = typeof searchParams.officer === "string" ? searchParams.officer : undefined;
  const statusParam = typeof searchParams.status === "string" ? searchParams.status : undefined;

  const repository = getPublicIntakeRepository();
  const initialSummary = await repository.getDashboardSummary({
    fromDate,
    toDate,
    officer,
    status: statusParam as PublicStatus | undefined,
  });

  return <DashboardClient initialSummary={initialSummary} />;
}
