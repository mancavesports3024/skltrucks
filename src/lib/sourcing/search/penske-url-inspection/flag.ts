/**
 * Feature flag for staff-operated Penske unit URL inspection.
 * Fail-closed: missing / empty / any value other than true|1 → disabled.
 */
export function isPenskeUrlInspectionEnabled(
  envValue: string | undefined = process.env.SOURCING_PENSKE_URL_INSPECTION_ENABLED
): boolean {
  const v = String(envValue ?? "")
    .trim()
    .toLowerCase();
  return v === "true" || v === "1";
}

/** Hard cap on unique unit URLs / inspections per staff run. */
export const PENSKE_URL_INSPECTION_MAX_URLS = 10;

/**
 * Separate server-side web_search tool budget for inspect-only mode
 * (default 10 = one call per unit; format retries use 0 tools).
 */
export function getPenskeUrlInspectionMaxToolCalls(
  envValue: string | undefined = process.env.SOURCING_PENSKE_URL_INSPECTION_MAX_TOOL_CALLS
): number {
  const n = Number(envValue ?? "10");
  if (!Number.isFinite(n) || n < 1) return PENSKE_URL_INSPECTION_MAX_URLS;
  return Math.min(Math.floor(n), PENSKE_URL_INSPECTION_MAX_URLS);
}
