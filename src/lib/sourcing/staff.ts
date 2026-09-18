import { SITE } from "@/lib/constants";

/**
 * Parse comma/whitespace-separated staff emails from SOURCING_STAFF_EMAILS.
 * Empty / missing env returns [] — missing configuration must not grant access.
 * Database `sourcing_authorized_staff` remains authoritative for RLS.
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

export function isSourcingStaffEmail(
  email: string | null | undefined,
  allowlist: string[] = getSourcingStaffAllowlist()
): boolean {
  if (!email) return false;
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

/** Documented example seed email (must still be listed in env + DB to grant access). */
export const EXAMPLE_SOURCING_STAFF_EMAIL = SITE.email.toLowerCase();
