/** Cache / API version — bump when fingerprint or payload shape changes. */
export const GOOGLE_ROUTES_CACHE_VERSION = "google_routes_v1" as const;

export const GOOGLE_ROUTES_PROVIDER = "google_routes" as const;

export const CITY_CENTER_DRIVING_LABEL =
  "Estimated driving distance between city centers" as const;

export const CITY_CENTER_CONFIRM_NOTICE =
  "Estimated using city-center driving distance. Confirm actual mileage and price with the carrier." as const;

export const DRIVING_DISTANCE_UNAVAILABLE_MESSAGE =
  "Driving distance unavailable. Enter Transportation manually." as const;

export const DRIVING_DISTANCE_CALCULATING_LABEL = "Calculating driving distance…" as const;

export const DRIVING_DISTANCE_CACHED_LABEL = "Using saved driving-distance estimate" as const;

export type GoogleRoutesFailureCategory =
  | "missing_key"
  | "missing_destination"
  | "no_route"
  | "timeout"
  | "auth"
  | "quota"
  | "malformed"
  | "provider"
  | "daily_limit"
  | "busy"
  | "unauthorized";

/** Structured cache blob stored in `spec_evidence.drivingRoute` (jsonb — no migration). */
export type DrivingRouteCache = {
  version: typeof GOOGLE_ROUTES_CACHE_VERSION;
  provider: typeof GOOGLE_ROUTES_PROVIDER;
  distanceMeters: number;
  /** Unrounded miles for transportation math. */
  distanceMiles: number;
  durationSeconds: number | null;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  calculatedAt: string;
  cityCenterEstimate: true;
  methodLabel: typeof CITY_CENTER_DRIVING_LABEL;
};

export type DrivingDistanceUsage = {
  provider: typeof GOOGLE_ROUTES_PROVIDER;
  cached: boolean;
  requestCount: number;
  success: boolean;
  failureCategory: GoogleRoutesFailureCategory | null;
  calculatedAt: string;
};

export type DrivingDistanceSuccess = {
  ok: true;
  cache: DrivingRouteCache;
  displayMiles: number;
  transportationDefaultUsd: number;
  usage: DrivingDistanceUsage;
  message: typeof DRIVING_DISTANCE_CACHED_LABEL | null;
};

export type DrivingDistanceFailure = {
  ok: false;
  error: string;
  failureCategory: GoogleRoutesFailureCategory;
  usage: DrivingDistanceUsage;
  /** Existing straight-line miles for reference only — never used as driving. */
  straightLineMiles: number | null;
};

export type DrivingDistanceResult = DrivingDistanceSuccess | DrivingDistanceFailure;

export type GoogleRoutesComputeSuccess = {
  ok: true;
  distanceMeters: number;
  durationSeconds: number | null;
};

export type GoogleRoutesComputeFailure = {
  ok: false;
  category: Exclude<
    GoogleRoutesFailureCategory,
    "missing_destination" | "daily_limit" | "busy" | "unauthorized" | "missing_key"
  >;
  /** Sanitized staff-safe message — never includes API key or headers. */
  message: string;
};

export type GoogleRoutesComputeResult = GoogleRoutesComputeSuccess | GoogleRoutesComputeFailure;
