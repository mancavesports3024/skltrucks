/**
 * Market Comparison cost defaults (transportation rate + inspection).
 * Application defaults always apply when profile fields are missing.
 */
import {
  calculateTransportationUsd,
  roundCurrencyUsd,
} from "@/lib/sourcing/distance/google-routes/units";

export const DEFAULT_TRANSPORTATION_RATE_PER_MILE = 2.25;
export const DEFAULT_INSPECTION_COST_USD = 230;

export function normalizeTransportationRatePerMile(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TRANSPORTATION_RATE_PER_MILE;
  return roundCurrencyUsd(n);
}

export function normalizeDefaultInspectionCost(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_INSPECTION_COST_USD;
  return roundCurrencyUsd(n);
}

export function transportationDefaultFromMiles(
  drivingMilesUnrounded: number,
  ratePerMile: number = DEFAULT_TRANSPORTATION_RATE_PER_MILE
): number {
  return calculateTransportationUsd(drivingMilesUnrounded, ratePerMile);
}

export function formatTransportationFormula(
  displayMiles: number,
  ratePerMile: number,
  transportationUsd: number
): string {
  const miles = Number.isFinite(displayMiles) ? String(Math.round(displayMiles)) : "—";
  const rate = Number.isFinite(ratePerMile) ? ratePerMile.toFixed(2) : "—";
  const total = Number.isFinite(transportationUsd) ? transportationUsd.toFixed(2) : "—";
  return `${miles} mi × $${rate}/mi = $${total}`;
}
