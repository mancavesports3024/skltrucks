import { redirect } from "next/navigation";
import { requireSourcingStaff } from "@/lib/sourcing/access";

/**
 * Gate all /admin/sourcing pages: signed-in + SOURCING_STAFF_EMAILS + DB staff row.
 * Complements RLS; does not rely on URL middleware alone.
 * Does not change authorization for the rest of /admin.
 */
export default async function SourcingLayout({ children }: { children: React.ReactNode }) {
  const access = await requireSourcingStaff();
  if (!access.ok) {
    if (access.status === 401) redirect("/admin/login");
    const reason = access.error.includes("not available")
      ? "sourcing_forbidden_schema"
      : access.error.includes("missing or empty")
        ? "sourcing_forbidden_env"
        : access.error.includes("SOURCING_STAFF_EMAILS")
          ? "sourcing_forbidden_email"
          : access.error.includes("sourcing_authorized_staff")
            ? "sourcing_forbidden_db"
            : "sourcing_forbidden";
    redirect(`/admin?error=${reason}`);
  }
  return children;
}
