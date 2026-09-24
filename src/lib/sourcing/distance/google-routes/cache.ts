import { SKL_DISTANCE_ORIGIN } from "@/lib/sourcing/distance/origin";
import {
  CITY_CENTER_DRIVING_LABEL,
  GOOGLE_ROUTES_CACHE_VERSION,
  GOOGLE_ROUTES_PROVIDER,
  type DrivingRouteCache,
} from "@/lib/sourcing/distance/google-routes/types";
import { metersToMiles } from "@/lib/sourcing/distance/google-routes/units";

const COORD_EPS = 1e-5;

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coordsEqual(aLat: number, aLng: number, bLat: number, bLng: number): boolean {
  return Math.abs(aLat - bLat) < COORD_EPS && Math.abs(aLng - bLng) < COORD_EPS;
}

/** Build a fresh cache entry from a successful Google Routes response. */
export function buildDrivingRouteCache(input: {
  distanceMeters: number;
  durationSeconds: number | null;
  destLat: number;
  destLng: number;
  calculatedAt?: string;
}): DrivingRouteCache {
  return {
    version: GOOGLE_ROUTES_CACHE_VERSION,
    provider: GOOGLE_ROUTES_PROVIDER,
    distanceMeters: input.distanceMeters,
    distanceMiles: metersToMiles(input.distanceMeters),
    durationSeconds: input.durationSeconds,
    originLat: SKL_DISTANCE_ORIGIN.latitude,
    originLng: SKL_DISTANCE_ORIGIN.longitude,
    destLat: input.destLat,
    destLng: input.destLng,
    calculatedAt: input.calculatedAt ?? new Date().toISOString(),
    cityCenterEstimate: true,
    methodLabel: CITY_CENTER_DRIVING_LABEL,
  };
}

/** Parse cache from spec_evidence.drivingRoute (object or JSON string). */
export function parseDrivingRouteCache(raw: unknown): DrivingRouteCache | null {
  let obj: Record<string, unknown> | null = null;
  if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  } else if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (!obj) return null;
  if (obj.version !== GOOGLE_ROUTES_CACHE_VERSION) return null;
  if (obj.provider !== GOOGLE_ROUTES_PROVIDER) return null;
  if (obj.cityCenterEstimate !== true) return null;

  const distanceMeters = asFiniteNumber(obj.distanceMeters);
  const distanceMiles = asFiniteNumber(obj.distanceMiles);
  const originLat = asFiniteNumber(obj.originLat);
  const originLng = asFiniteNumber(obj.originLng);
  const destLat = asFiniteNumber(obj.destLat);
  const destLng = asFiniteNumber(obj.destLng);
  const calculatedAt = String(obj.calculatedAt ?? "").trim();
  if (
    distanceMeters == null ||
    distanceMeters < 0 ||
    distanceMiles == null ||
    distanceMiles < 0 ||
    originLat == null ||
    originLng == null ||
    destLat == null ||
    destLng == null ||
    !calculatedAt
  ) {
    return null;
  }

  const durationRaw = obj.durationSeconds;
  const durationSeconds =
    durationRaw == null || durationRaw === ""
      ? null
      : asFiniteNumber(durationRaw);

  return {
    version: GOOGLE_ROUTES_CACHE_VERSION,
    provider: GOOGLE_ROUTES_PROVIDER,
    distanceMeters,
    distanceMiles,
    durationSeconds: durationSeconds != null && durationSeconds >= 0 ? durationSeconds : null,
    originLat,
    originLng,
    destLat,
    destLng,
    calculatedAt,
    cityCenterEstimate: true,
    methodLabel: CITY_CENTER_DRIVING_LABEL,
  };
}

/**
 * Cache is fresh only when origin, destination, provider, and version still match.
 * Location/coord changes invalidate the cache.
 */
export function isDrivingRouteCacheFresh(
  cache: DrivingRouteCache | null | undefined,
  destLat: number,
  destLng: number
): cache is DrivingRouteCache {
  if (!cache) return false;
  if (cache.version !== GOOGLE_ROUTES_CACHE_VERSION) return false;
  if (cache.provider !== GOOGLE_ROUTES_PROVIDER) return false;
  if (
    !coordsEqual(
      cache.originLat,
      cache.originLng,
      SKL_DISTANCE_ORIGIN.latitude,
      SKL_DISTANCE_ORIGIN.longitude
    )
  ) {
    return false;
  }
  return coordsEqual(cache.destLat, cache.destLng, destLat, destLng);
}
