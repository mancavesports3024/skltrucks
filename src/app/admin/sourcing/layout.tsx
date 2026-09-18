import { redirect } from "next/navigation";
import { requireSourcingStaff } from "@/lib/sourcing/access";

/**
 * Gate all /admin/sourcing pages: signed-in + app allowlist + DB is_sourcing_staff().
 * Complements RLS; does not rely on URL middleware alone.
 */
export default async function SourcingLayout({ children }: { children: React.ReactNode }) {
  const access = await requireSourcingStaff();
  if (!access.ok) {
    if (access.status === 401) redirect("/admin/login");
    redirect("/admin?error=sourcing_forbidden");
  }
  return children;
}
