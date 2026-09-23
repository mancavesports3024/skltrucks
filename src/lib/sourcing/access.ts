/**
 * Sourcing authorization — identical to inventory Admin.
 * Prefer requireAdmin() for new code; this alias keeps existing call sites stable.
 */
import { requireAdmin, type AdminAccess } from "@/lib/admin/access";

export type SourcingAccess = AdminAccess;

/**
 * Authorize private sourcing. Same decision as requireAdmin():
 * any authenticated Supabase Auth user. No separate sourcing email allowlist.
 * Database RLS uses public.is_sourcing_staff() with the same authenticated bar.
 */
export async function requireSourcingStaff(): Promise<SourcingAccess> {
  return requireAdmin();
}
