import { isSourcingStaffEmail } from "@/lib/sourcing/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";

export type SourcingAccess =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; error: string; status: 401 | 403 };

/**
 * Authorize sourcing access for the signed-in user.
 * Checks app allowlist (env / default) AND Supabase RPC is_sourcing_staff() when available.
 * Does not rely on /admin URL middleware alone.
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
      error: "Forbidden — this account is not authorized for private sourcing.",
      status: 403,
    };
  }

  // Defense in depth: DB allowlist via security-definer RPC (same rule as RLS)
  const { data: isStaff, error } = await supabase.rpc("is_sourcing_staff");
  if (error) {
    // Schema not applied yet — deny rather than open access
    console.error("[sourcing] is_sourcing_staff RPC:", error.message);
    return {
      ok: false,
      error:
        "Sourcing authorization is not available. Apply supabase/sourcing-schema.sql and ensure your email is in sourcing_authorized_staff.",
      status: 403,
    };
  }

  if (!isStaff) {
    return {
      ok: false,
      error:
        "Forbidden — add this email to sourcing_authorized_staff before accessing sourcing data.",
      status: 403,
    };
  }

  return { ok: true, user, supabase };
}
