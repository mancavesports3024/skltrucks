/**
 * Sourcing uses the same access bar as inventory admin: any signed-in
 * Supabase Auth user. Optional SOURCING_STAFF_EMAILS can further restrict
 * (comma-separated); when unset/empty, all authenticated admins are allowed.
 */
export function getSourcingStaffAllowlist(
  envValue: string | undefined = process.env.SOURCING_STAFF_EMAILS
): string[] {
  const parsed = (envValue ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(parsed)];
}

/**
 * When SOURCING_STAFF_EMAILS is set, only those emails pass.
 * When unset/empty, any signed-in account with an email passes (same as /admin).
 */
export function isSourcingStaffEmail(
  email: string | null | undefined,
  allowlist: string[] = getSourcingStaffAllowlist()
): boolean {
  if (!email) return false;
  if (allowlist.length === 0) return true;
  return allowlist.includes(email.trim().toLowerCase());
}
