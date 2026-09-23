import { isSourcingStaffEmail } from "@/lib/sourcing/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";

export type SourcingAccess =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; error: string; status: 401 | 403 };

/**
 * Authorize sourcing access for the signed-in admin user.
 * Same bar as inventory: authenticated Supabase user.
 * Optional SOURCING_STAFF_EMAILS can narrow further; RLS uses is_sourcing_staff().
 *
 * `sourcing_authorized_staff` is an optional directory (notes / future use), not
 * required for access — same agreement as PR #14.
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

  return { ok: true, user, supabase };
}
