import { SITE } from "@/lib/constants";

/** Default staff emails when SOURCING_STAFF_EMAILS is unset (must also exist in DB allowlist). */
export const DEFAULT_SOURCING_STAFF_EMAILS = [SITE.email.toLowerCase()];

/**
 * Parse comma/whitespace-separated staff emails from env.
 * Empty / missing env falls back to DEFAULT_SOURCING_STAFF_EMAILS for app-layer checks.
 */
export function getSourcingStaffAllowlist(
  envValue: string | undefined = process.env.SOURCING_STAFF_EMAILS
): string[] {
  const parsed = (envValue ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (parsed.length === 0) {
    return [...DEFAULT_SOURCING_STAFF_EMAILS];
  }
  return [...new Set(parsed)];
}

export function isSourcingStaffEmail(
  email: string | null | undefined,
  allowlist: string[] = getSourcingStaffAllowlist()
): boolean {
  if (!email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
