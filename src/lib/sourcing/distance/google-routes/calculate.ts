import "server-only";

import {
  buildDrivingRouteCache,
  isDrivingRouteCacheFresh,
  parseDrivingRouteCache,
} from "@/lib/sourcing/distance/google-routes/cache";
import {
  computeGoogleRoute,
  getGoogleMapsRoutesApiKey,
} from "@/lib/sourcing/distance/google-routes/client";
import {
  tryConsumeGoogleRoutesDailyQuota,
} from "@/lib/sourcing/distance/google-routes/daily-limit";
import {
  DRIVING_DISTANCE_BUSY_MESSAGE,
  drivingDistanceLockKey,
  releaseDrivingDistanceLock,
  tryAcquireDrivingDistanceLock,
} from "@/lib/sourcing/distance/google-routes/lock";
import {
  CITY_CENTER_DRIVING_LABEL,
  DRIVING_DISTANCE_CACHED_LABEL,
  DRIVING_DISTANCE_UNAVAILABLE_MESSAGE,
  GOOGLE_ROUTES_CACHE_VERSION,
  GOOGLE_ROUTES_PROVIDER,
  type DrivingDistanceResult,
  type DrivingDistanceUsage,
  type DrivingRouteCache,
  type GoogleRoutesFailureCategory,
} from "@/lib/sourcing/distance/google-routes/types";
import {
  calculateTransportationUsd,
  roundDrivingMilesForDisplay,
} from "@/lib/sourcing/distance/google-routes/units";
import { estimateDistanceFromLocation } from "@/lib/sourcing/distance/estimate-from-location";
import { SKL_DISTANCE_ORIGIN } from "@/lib/sourcing/distance/origin";
import {
  DEFAULT_TRANSPORTATION_RATE_PER_MILE,
  normalizeTransportationRatePerMile,
} from "@/lib/sourcing/market-comparison/cost-defaults";
import type { SpecEvidence } from "@/types/sourcing";

export type CalculateDrivingDistanceInput = {
  leadId: string;
  location: string;
  /** Legacy Haversine classification miles on driving_distance_miles — never overwritten. */
  straightLineMiles: number | null;
  specEvidence: SpecEvidence | null | undefined;
  transportationRatePerMile?: number;
  holderEmail: string;
  /** Injected Google compute for tests. */
  computeRoute?: typeof computeGoogleRoute;
  apiKey?: string | null;
  now?: Date;
  env?: NodeJS.ProcessEnv;
};

function usageBase(
  partial: Partial<DrivingDistanceUsage> & Pick<DrivingDistanceUsage, "cached" | "requestCount" | "success">
): DrivingDistanceUsage {
  return {
    provider: GOOGLE_ROUTES_PROVIDER,
    failureCategory: null,
    calculatedAt: new Date().toISOString(),
    ...partial,
  };
}

function fail(
  category: GoogleRoutesFailureCategory,
  error: string,
  straightLineMiles: number | null,
  requestCount: number,
  cached = false
): DrivingDistanceResult {
  return {
    ok: false,
    error,
    failureCategory: category,
    straightLineMiles,
    usage: usageBase({
      cached,
      requestCount,
      success: false,
      failureCategory: category,
    }),
  };
}

function successFromCache(
  existing: DrivingRouteCache,
  rate: number
): DrivingDistanceResult & { cacheToPersist?: DrivingRouteCache } {
  const displayMiles = roundDrivingMilesForDisplay(existing.distanceMiles);
  const transportationDefaultUsd = calculateTransportationUsd(existing.distanceMiles, rate);
  return {
    ok: true,
    cache: existing,
    displayMiles,
    transportationDefaultUsd,
    message: DRIVING_DISTANCE_CACHED_LABEL,
    usage: usageBase({
      cached: true,
      requestCount: 0,
      success: true,
      calculatedAt: existing.calculatedAt,
    }),
  };
}

/**
 * Resolve Census destination coordinates from the lead location (offline).
 * Does not call Google Geocoding.
 */
export function resolveDestinationCoordinates(location: string): {
  ok: true;
  lat: number;
  lng: number;
  display: string;
} | {
  ok: false;
  reason: "missing_destination";
} {
  const est = estimateDistanceFromLocation(location);
  if (!est.ok) return { ok: false, reason: "missing_destination" };
  return {
    ok: true,
    lat: est.resolved.latitude,
    lng: est.resolved.longitude,
    display: est.resolved.display,
  };
}

/**
 * Calculate or reuse cached Google Routes driving distance for Market Comparison.
 * Does not change classification miles (`driving_distance_miles` Haversine field).
 * Max one Google request per successful provider invocation (zero when cache is fresh).
 *
 * Cache freshness policy (no wall-clock TTL):
 * - Fresh while origin coords, destination coords, provider, and cache version match.
 * - Stale after location/dest change, origin constant change, or version bump.
 * - "Calculate again" with a fresh cache returns the saved estimate (0 Google calls).
 */
export async function calculateDrivingDistanceForLead(
  input: CalculateDrivingDistanceInput
): Promise<DrivingDistanceResult & { cacheToPersist?: DrivingRouteCache }> {
  const rate = normalizeTransportationRatePerMile(
    input.transportationRatePerMile ?? DEFAULT_TRANSPORTATION_RATE_PER_MILE
  );
  const straightLineMiles = input.straightLineMiles;
  const holder = input.holderEmail || "staff";

  const dest = resolveDestinationCoordinates(input.location);
  if (!dest.ok) {
    return fail(
      "missing_destination",
      "Destination coordinates unavailable for this lead location. Enter Transportation manually.",
      straightLineMiles,
      0
    );
  }

  const existing = parseDrivingRouteCache(input.specEvidence?.drivingRoute);
  if (isDrivingRouteCacheFresh(existing, dest.lat, dest.lng)) {
    return successFromCache(existing, rate);
  }

  const lockKey = drivingDistanceLockKey(
    input.leadId,
    dest.lat,
    dest.lng,
    GOOGLE_ROUTES_CACHE_VERSION
  );
  const lock = tryAcquireDrivingDistanceLock(lockKey, holder);
  if (!lock.ok) {
    return fail("busy", lock.message || DRIVING_DISTANCE_BUSY_MESSAGE, straightLineMiles, 0);
  }

  try {
    // Re-check after lock — another tab may have populated the cache.
    const again = parseDrivingRouteCache(input.specEvidence?.drivingRoute);
    if (isDrivingRouteCacheFresh(again, dest.lat, dest.lng)) {
      return successFromCache(again, rate);
    }

    const env = input.env ?? process.env;
    const apiKey =
      input.apiKey === undefined ? getGoogleMapsRoutesApiKey(env) : input.apiKey;
    if (!apiKey) {
      return fail(
        "missing_key",
        "Driving-distance provider is not configured. Enter Transportation manually.",
        straightLineMiles,
        0
      );
    }

    const quota = tryConsumeGoogleRoutesDailyQuota(env, input.now);
    if (!quota.ok) {
      return fail("daily_limit", quota.message, straightLineMiles, 0);
    }

    const compute = input.computeRoute ?? computeGoogleRoute;
    const route = await compute({
      originLat: SKL_DISTANCE_ORIGIN.latitude,
      originLng: SKL_DISTANCE_ORIGIN.longitude,
      destLat: dest.lat,
      destLng: dest.lng,
      apiKey,
    });

    if (!route.ok) {
      const msg =
        route.category === "no_route"
          ? `${DRIVING_DISTANCE_UNAVAILABLE_MESSAGE} (${CITY_CENTER_DRIVING_LABEL} — no route.)`
          : route.message.includes("Transportation")
            ? route.message
            : `${DRIVING_DISTANCE_UNAVAILABLE_MESSAGE} ${route.message}`;
      return fail(route.category, msg, straightLineMiles, 1);
    }

    const cache = buildDrivingRouteCache({
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      destLat: dest.lat,
      destLng: dest.lng,
      calculatedAt: (input.now ?? new Date()).toISOString(),
    });
    const displayMiles = roundDrivingMilesForDisplay(cache.distanceMiles);
    const transportationDefaultUsd = calculateTransportationUsd(cache.distanceMiles, rate);

    return {
      ok: true,
      cache,
      displayMiles,
      transportationDefaultUsd,
      message: null,
      cacheToPersist: cache,
      usage: usageBase({
        cached: false,
        requestCount: 1,
        success: true,
        calculatedAt: cache.calculatedAt,
      }),
    };
  } finally {
    releaseDrivingDistanceLock(lockKey, holder);
  }
}
