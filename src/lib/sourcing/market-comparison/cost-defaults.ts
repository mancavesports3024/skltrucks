/**
 * Market Comparison cost defaults (transportation rate + inspection).
 * Application defaults always apply when profile fields are missing/null.
 *
 * Persistence requires production SQL:
 *   supabase/sourcing-mc-driving-distance-required.sql
 */
import {
  calculateTransportationUsd,
  roundCurrencyUsd,
} from "@/lib/sourcing/distance/google-routes/units";

export const DEFAULT_TRANSPORTATION_RATE_PER_MILE = 2.25;
export const DEFAULT_INSPECTION_COST_USD = 230;

/** Reasonable maximum $/mi (staff-editable). Above this is rejected. */
export const MAX_TRANSPORTATION_RATE_PER_MILE = 100;

/** Reasonable maximum inspection default USD. */
export const MAX_DEFAULT_INSPECTION_COST_USD = 100_000;

/** Matches DB numeric(10,4). */
export const TRANSPORTATION_RATE_MAX_DECIMALS = 4;

/** Matches DB numeric(12,2) and currency cents. */
export const INSPECTION_COST_MAX_DECIMALS = 2;

export type CostDefaultParseSuccess = {
  ok: true;
  value: number;
};

export type CostDefaultParseFailure = {
  ok: false;
  error: string;
};

function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return Number.POSITIVE_INFINITY;
  const s = String(n);
  if (s.includes("e") || s.includes("E")) {
    // Scientific notation — treat as too precise / unsafe for currency storage.
    return Number.POSITIVE_INFINITY;
  }
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

function parseNonNegativeFinite(raw: unknown, label: string): CostDefaultParseFailure | { ok: true; n: number } {
  if (raw == null || raw === "") {
    return { ok: false, error: `${label} is required.` };
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { ok: false, error: `${label} must be a finite number.` };
    }
    if (raw < 0) {
      return { ok: false, error: `${label} cannot be negative.` };
    }
    return { ok: true, n: raw };
  }
  const s = String(raw).trim().replace(/[$,\s]/g, "");
  if (!s || !/^\d+(\.\d+)?$/.test(s)) {
    return { ok: false, error: `${label} must be a non-negative number.` };
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    return { ok: false, error: `${label} must be a finite number.` };
  }
  if (n < 0) {
    return { ok: false, error: `${label} cannot be negative.` };
  }
  return { ok: true, n };
}

/**
 * Strict server-side validation for transportation rate.
 * Does not silently coerce invalid input to the default.
 */
export function parseTransportationRatePerMile(raw: unknown): CostDefaultParseSuccess | CostDefaultParseFailure {
  const parsed = parseNonNegativeFinite(raw, "Transportation rate per mile");
  if (!parsed.ok) return parsed;
  if (parsed.n > MAX_TRANSPORTATION_RATE_PER_MILE) {
    return {
      ok: false,
      error: `Transportation rate per mile cannot exceed $${MAX_TRANSPORTATION_RATE_PER_MILE}.`,
    };
  }
  if (decimalPlaces(parsed.n) > TRANSPORTATION_RATE_MAX_DECIMALS) {
    return {
      ok: false,
      error: `Transportation rate per mile allows at most ${TRANSPORTATION_RATE_MAX_DECIMALS} decimal places.`,
    };
  }
  // Store at DB precision (4 dp) without IEEE surprise for typical money rates.
  const value = Math.round(parsed.n * 10_000) / 10_000;
  return { ok: true, value };
}

/**
 * Strict server-side validation for default inspection cost.
 */
export function parseDefaultInspectionCost(raw: unknown): CostDefaultParseSuccess | CostDefaultParseFailure {
  const parsed = parseNonNegativeFinite(raw, "Default inspection cost");
  if (!parsed.ok) return parsed;
  if (parsed.n > MAX_DEFAULT_INSPECTION_COST_USD) {
    return {
      ok: false,
      error: `Default inspection cost cannot exceed $${MAX_DEFAULT_INSPECTION_COST_USD.toLocaleString("en-US")}.`,
    };
  }
  if (decimalPlaces(parsed.n) > INSPECTION_COST_MAX_DECIMALS) {
    return {
      ok: false,
      error: `Default inspection cost allows at most ${INSPECTION_COST_MAX_DECIMALS} decimal places (cents).`,
    };
  }
  const value = roundCurrencyUsd(parsed.n);
  return { ok: true, value };
}

/** Soft normalize for reads / missing DB columns — never invent from invalid staff input. */
export function normalizeTransportationRatePerMile(raw: unknown): number {
  if (raw == null || raw === "") return DEFAULT_TRANSPORTATION_RATE_PER_MILE;
  const parsed = parseTransportationRatePerMile(raw);
  return parsed.ok ? parsed.value : DEFAULT_TRANSPORTATION_RATE_PER_MILE;
}

export function normalizeDefaultInspectionCost(raw: unknown): number {
  if (raw == null || raw === "") return DEFAULT_INSPECTION_COST_USD;
  const parsed = parseDefaultInspectionCost(raw);
  return parsed.ok ? parsed.value : DEFAULT_INSPECTION_COST_USD;
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
