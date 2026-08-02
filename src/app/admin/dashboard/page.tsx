import { redirect } from "next/navigation";

import { requireActiveUser } from "@/modules/auth/authorization";
import { getPublicIntakeRepository, type PublicStatus } from "@/modules/public-intake/repository";
import { DASHBOARD_VIEW_ROLES, EXPORT_ROLES } from "@/modules/submissions/review";
import { DashboardClient } from "@/components/admin/dashboard-client";
import { normalizeDashboardFilters } from "@/lib/validation";
import { PUBLIC_STATUSES, PUBLIC_BUCKETS } from "@/modules/public-intake/workflow";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const user = await requireActiveUser(DASHBOARD_VIEW_ROLES);

  let filters;
  try {
    filters = normalizeDashboardFilters({
      from: searchParams.from,
      to: searchParams.to,
      officer: searchParams.officer,
      status: searchParams.status,
      validStatuses: PUBLIC_STATUSES,
      validBuckets: PUBLIC_BUCKETS,
    });
  } catch {
    redirect("/admin/dashboard");
  }

  const repository = getPublicIntakeRepository();
  const initialSummary = await repository.getDashboardSummary({
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    officer: filters.officer,
    status: filters.status as PublicStatus | undefined,
  });

  const canExport = user.roles.some((role) => EXPORT_ROLES.includes(role as typeof EXPORT_ROLES[number]));

  return <DashboardClient initialSummary={initialSummary} canExport={canExport} />;
}
