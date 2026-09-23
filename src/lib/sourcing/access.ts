import { isSourcingStaffEmail } from "@/lib/sourcing/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";

export type SourcingAccess =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; error: string; status: 401 | 403 };

/**
 * Authorize sourcing access for the signed-in admin user.
 *
 * Both gates must pass (fail-closed):
 * 1) Optional narrowing via SOURCING_STAFF_EMAILS (when set); empty/missing email denies
 * 2) Database RPC public.is_sourcing_staff() — requires an active
 *    sourcing_authorized_staff directory row (not merely auth.role()=authenticated)
 *
 * Direct Supabase REST access is protected only by (2). The Vercel env allowlist
 * is never consulted by SQL/RLS.
 */
export async function requireSourcingStaff(): Promise<SourcingAccess> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Database not connected.", status: 401 };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized", status: 401 };
  }

  if (!isSourcingStaffEmail(user.email)) {
    return {
      ok: false,
      error: "Forbidden — this account is not on SOURCING_STAFF_EMAILS.",
      status: 403,
    };
  }

  const { data: isStaff, error } = await supabase.rpc("is_sourcing_staff");
  if (error) {
    console.error("[sourcing] is_sourcing_staff RPC:", error.message);
    return {
      ok: false,
      error:
        "Sourcing authorization is not available. Apply supabase/sourcing-schema.sql and supabase/sourcing-staff-rls-failclosed.sql to this Supabase project.",
      status: 403,
    };
  }

  if (!isStaff) {
    return {
      ok: false,
      error:
        "Forbidden — this account is not an active authorized sourcing staff member.",
      status: 403,
    };
  }

  return { ok: true, user, supabase };
}
