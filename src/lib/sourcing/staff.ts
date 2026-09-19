/**
 * Fail-closed sourcing email allowlist (application layer).
 *
 * SOURCING_STAFF_EMAILS must contain the user's normalized email.
 * Missing, empty, or malformed env authorizes nobody.
 * RLS/SQL uses sourcing_authorized_staff separately — both are required.
 */
export function getSourcingStaffAllowlist(
  envValue: string | undefined = process.env.SOURCING_STAFF_EMAILS
): string[] {
  if (envValue == null) return [];
  const trimmed = String(envValue).trim();
  if (!trimmed) return [];

  const parsed = trimmed
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@") && e.length > 3);

  return [...new Set(parsed)];
}

/**
 * True only when the email is explicitly listed in SOURCING_STAFF_EMAILS.
 * Empty/unset allowlist → false (fail closed).
 */
export function isSourcingStaffEmail(
  email: string | null | undefined,
  allowlist: string[] = getSourcingStaffAllowlist()
): boolean {
  if (!email || !String(email).trim()) return false;
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

/** True when the env allowlist is configured with at least one valid email. */
export function isSourcingStaffAllowlistConfigured(
  envValue: string | undefined = process.env.SOURCING_STAFF_EMAILS
): boolean {
  return getSourcingStaffAllowlist(envValue).length > 0;
}
