/** Display helpers for sourcing admin UI — no classification logic. */

export function formatLeadYear(year: number | null | undefined): string {
  if (year == null || !Number.isFinite(year)) return "—";
  return String(Math.trunc(year));
}

export function formatLeadMileage(mileage: number | null | undefined): string {
  if (mileage == null || !Number.isFinite(mileage)) return "—";
  return `${Math.trunc(mileage).toLocaleString("en-US")} mi`;
}
