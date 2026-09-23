import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/access";

/**
 * Gate all /admin/sourcing pages with the same Admin rule as inventory:
 * any authenticated Supabase Auth user.
 */
export default async function SourcingLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAdmin();
  if (!access.ok) {
    if (access.status === 401) redirect("/admin/login");
    redirect("/admin?error=sourcing_forbidden");
  }
  return children;
}
