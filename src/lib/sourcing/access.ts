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
 * Defense in depth (all required):
 * 1. Signed-in Supabase Auth user
 * 2. Optional SOURCING_STAFF_EMAILS env allowlist (when configured)
 * 3. Database RPC public.is_sourcing_staff()
 * 4. Active matching row in public.sourcing_authorized_staff
 *
 * RLS on market comparisons also requires (3)+(4) so direct REST access cannot bypass.
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
        "Sourcing authorization is not available. Apply supabase/sourcing-schema.sql to this Supabase project.",
      status: 403,
    };
  }

  if (!isStaff) {
    return {
      ok: false,
      error: "Forbidden — sign in with an admin account to use private sourcing.",
      status: 403,
    };
  }

  const email = String(user.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) {
    return {
      ok: false,
      error: "Forbidden — sourcing requires an authenticated account email.",
      status: 403,
    };
  }

  const { data: staffRow, error: staffErr } = await supabase
    .from("sourcing_authorized_staff")
    .select("email, active")
    .eq("email", email)
    .maybeSingle();

  if (staffErr) {
    console.error("[sourcing] sourcing_authorized_staff:", staffErr.message);
    return {
      ok: false,
      error:
        "Sourcing staff directory is not available. Apply supabase/sourcing-schema.sql to this Supabase project.",
      status: 403,
    };
  }

  if (!staffRow || staffRow.active !== true) {
    return {
      ok: false,
      error:
        "Forbidden — this account is not an active authorized sourcing staff member.",
      status: 403,
    };
  }

  return { ok: true, user, supabase };
}
