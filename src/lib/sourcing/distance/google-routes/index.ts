/** Client-safe Google Routes / driving-distance exports (no network). */
export {
  buildDrivingRouteCache,
  isDrivingRouteCacheFresh,
  parseDrivingRouteCache,
} from "@/lib/sourcing/distance/google-routes/cache";
export {
  METERS_PER_MILE,
  metersToMiles,
  roundCurrencyUsd,
  roundDrivingMilesForDisplay,
  calculateTransportationUsd,
} from "@/lib/sourcing/distance/google-routes/units";
export {
  CITY_CENTER_CONFIRM_NOTICE,
  CITY_CENTER_DRIVING_LABEL,
  DRIVING_DISTANCE_CALCULATING_LABEL,
  DRIVING_DISTANCE_CACHED_LABEL,
  DRIVING_DISTANCE_UNAVAILABLE_MESSAGE,
  GOOGLE_ROUTES_CACHE_VERSION,
  GOOGLE_ROUTES_PROVIDER,
} from "@/lib/sourcing/distance/google-routes/types";
export type {
  DrivingDistanceFailure,
  DrivingDistanceResult,
  DrivingDistanceSuccess,
  DrivingDistanceUsage,
  DrivingRouteCache,
  GoogleRoutesFailureCategory,
} from "@/lib/sourcing/distance/google-routes/types";
