import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveActiveUser } from "@/modules/auth/authorization";
import { DASHBOARD_VIEW_ROLES } from "@/modules/submissions/review";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return redirect("/");
  }

  const user = await resolveActiveUser(session.user.email);
  if (!user) {
    return redirect("/");
  }

  const hasDashboard = user.roles.some((r) => DASHBOARD_VIEW_ROLES.includes(r as typeof DASHBOARD_VIEW_ROLES[number]));
  if (hasDashboard) {
    return redirect("/admin/dashboard");
  }

  return redirect("/submissions");
}
