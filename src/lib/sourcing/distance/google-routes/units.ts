/** Meters → miles conversion factor (international mile). */
export const METERS_PER_MILE = 1609.344;

/** Unrounded miles for transportation math. */
export function metersToMiles(distanceMeters: number): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return Number.NaN;
  return distanceMeters / METERS_PER_MILE;
}

/** Display driving distance as whole miles. */
export function roundDrivingMilesForDisplay(miles: number): number {
  if (!Number.isFinite(miles) || miles < 0) return Number.NaN;
  return Math.round(miles);
}

/** Round currency to two decimal places (half-up via Math.round). */
export function roundCurrencyUsd(amount: number): number {
  if (!Number.isFinite(amount)) return Number.NaN;
  return Math.round(amount * 100) / 100;
}

/**
 * Transportation = unrounded driving miles × rate, then round to cents.
 * Example: 160 × 2.25 = 360.00
 */
export function calculateTransportationUsd(
  drivingMilesUnrounded: number,
  ratePerMile: number
): number {
  if (!Number.isFinite(drivingMilesUnrounded) || drivingMilesUnrounded < 0) return Number.NaN;
  if (!Number.isFinite(ratePerMile) || ratePerMile < 0) return Number.NaN;
  return roundCurrencyUsd(drivingMilesUnrounded * ratePerMile);
}
