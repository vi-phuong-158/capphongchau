import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveActiveUser } from "@/modules/auth/authorization";
import { resolveInternalLandingPath } from "@/modules/submissions/review";

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

  const target = resolveInternalLandingPath(user.roles);
  return redirect(target);
}
