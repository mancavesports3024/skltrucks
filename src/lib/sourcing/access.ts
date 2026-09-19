import {
  isSourcingStaffAllowlistConfigured,
  isSourcingStaffEmail,
} from "@/lib/sourcing/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";

export type SourcingAccess =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; error: string; status: 401 | 403 };

/**
 * Authorize private sourcing (/admin/sourcing only).
 *
 * Requires ALL of:
 * 1. Authenticated Supabase user
 * 2. Email present in SOURCING_STAFF_EMAILS (fail-closed if unset/empty)
 * 3. is_sourcing_staff() RPC true — active row in sourcing_authorized_staff
 *
 * Being an inventory /admin user alone is not enough.
 * Does not change authorization for the rest of /admin.
 *
 * SQL/RLS enforces the database staff row; the application additionally
 * requires the server-side environment allowlist.
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

  if (!isSourcingStaffAllowlistConfigured()) {
    return {
      ok: false,
      error:
        "Forbidden — SOURCING_STAFF_EMAILS is missing or empty. Sourcing authorizes nobody until it lists staff emails.",
      status: 403,
    };
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
      error:
        "Forbidden — no active sourcing_authorized_staff row for this account.",
      status: 403,
    };
  }

  return { ok: true, user, supabase };
}
