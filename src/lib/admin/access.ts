/**
 * Shared inventory Admin / Sourcing authorization.
 *
 * Verified rule: Admin = any signed-in Supabase Auth user.
 * See is-admin-user.ts and supabase/schema.sql products policies.
 * Anonymous users remain denied. Every authenticated account can access
 * inventory Admin and private sourcing (app + RLS).
 */
import { isAdminUser } from "@/lib/admin/is-admin-user";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";

export type AdminAccess =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; error: string; status: 401 | 403 };

export { isAdminUser };

/**
 * Authorize inventory Admin (and therefore Sourcing) access.
 * Identical decision for /admin inventory and /admin/sourcing.
 */
export async function requireAdmin(): Promise<AdminAccess> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Database not connected.", status: 401 };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminUser(user)) {
    return { ok: false, error: "Unauthorized", status: 401 };
  }

  return { ok: true, user: user!, supabase };
}
