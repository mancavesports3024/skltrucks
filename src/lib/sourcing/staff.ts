/**
 * @deprecated Sourcing no longer uses a separate email allowlist.
 * Inventory Admin and Sourcing both authorize any authenticated Supabase user.
 * These helpers remain only so old env docs/tests can reference the removed gate.
 * Do not call from middleware, layouts, or server actions.
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

/** @deprecated Always returns true for non-empty email; allowlist is unused. */
export function isSourcingStaffEmail(
  email: string | null | undefined,
  _allowlist: string[] = getSourcingStaffAllowlist()
): boolean {
  return Boolean(email && String(email).trim());
}

/** @deprecated SOURCING_STAFF_EMAILS is not part of Admin/Sourcing authorization. */
export function isSourcingStaffAllowlistConfigured(
  envValue: string | undefined = process.env.SOURCING_STAFF_EMAILS
): boolean {
  return getSourcingStaffAllowlist(envValue).length > 0;
}
