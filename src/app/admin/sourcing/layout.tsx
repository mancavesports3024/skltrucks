import { redirect } from "next/navigation";
import { requireSourcingStaff } from "@/lib/sourcing/access";

/**
 * Gate all /admin/sourcing pages: same bar as inventory admin (signed-in).
 * Optional SOURCING_STAFF_EMAILS can narrow further.
 * Complements RLS; does not change authorization for the rest of /admin.
 */
export default async function SourcingLayout({ children }: { children: React.ReactNode }) {
  const access = await requireSourcingStaff();
  if (!access.ok) {
    if (access.status === 401) redirect("/admin/login");
    const reason = access.error.includes("not available")
      ? "sourcing_forbidden_schema"
      : access.error.includes("SOURCING_STAFF_EMAILS")
        ? "sourcing_forbidden_email"
        : "sourcing_forbidden";
    redirect(`/admin?error=${reason}`);
  }
  return children;
}
