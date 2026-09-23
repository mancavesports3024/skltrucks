/**
 * Sourcing staff email allowlist (application layer only).
 * Database RLS uses public.is_sourcing_staff() + sourcing_authorized_staff and
 * never reads this env var.
 *
 * When SOURCING_STAFF_EMAILS is set, only listed emails pass the app gate.
 * When unset/empty, any non-empty signed-in email passes the *app* gate — but
 * the database RPC must still return true (active directory row required).
 */
export function getSourcingStaffAllowlist(
  envValue: string | undefined = process.env.SOURCING_STAFF_EMAILS
): string[] {
  const parsed = (envValue ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@") && e.length > 3);

  return [...new Set(parsed)];
}

/**
 * When SOURCING_STAFF_EMAILS is set, only those emails pass.
 * When unset/empty, any non-empty email passes this app check (DB still fail-closed).
 * Missing/blank email always denies.
 */
export function isSourcingStaffEmail(
  email: string | null | undefined,
  allowlist: string[] = getSourcingStaffAllowlist()
): boolean {
  if (!email || !String(email).trim()) return false;
  if (allowlist.length === 0) return true;
  return allowlist.includes(email.trim().toLowerCase());
}

/** True when an optional narrowing allowlist is configured. */
export function isSourcingStaffAllowlistConfigured(
  envValue: string | undefined = process.env.SOURCING_STAFF_EMAILS
): boolean {
  return getSourcingStaffAllowlist(envValue).length > 0;
}
