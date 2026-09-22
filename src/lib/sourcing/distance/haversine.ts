/** Earth mean radius in miles (IUGG / common GIS convention). */
export const EARTH_RADIUS_MILES = 3958.7613;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle (haversine) distance between two WGS84 points, in miles.
 * Deterministic for finite inputs. Does not model roads or driving time.
 */
export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (![lat1, lon1, lat2, lon2].every((n) => Number.isFinite(n))) {
    return Number.NaN;
  }
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);
  const sinΔφ = Math.sin(Δφ / 2);
  const sinΔλ = Math.sin(Δλ / 2);
  const a = sinΔφ * sinΔφ + Math.cos(φ1) * Math.cos(φ2) * sinΔλ * sinΔλ;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_MILES * c;
}

/** Round to whole miles for classification/display (0.5 rounds away from zero via Math.round). */
export function roundMilesForClassification(miles: number): number {
  if (!Number.isFinite(miles)) return Number.NaN;
  return Math.round(miles);
}
