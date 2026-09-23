/**
 * Shared Admin identity predicate (Edge- and Node-safe).
 *
 * Inventory Admin authorization (verified):
 *   - Middleware: supabase.auth.getUser() must return a user for /admin
 *   - Products RLS: auth.role() = 'authenticated'
 *   - No email allowlist, role claim, or staff table for inventory Admin
 *
 * Therefore Admin = any authenticated Supabase Auth user.
 * Sourcing uses this same predicate.
 */
import type { User } from "@supabase/supabase-js";

export function isAdminUser(user: User | null | undefined): boolean {
  return Boolean(user);
}
