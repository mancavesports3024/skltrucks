import {
  haversineMiles,
  roundMilesForClassification,
} from "@/lib/sourcing/distance/haversine";
import {
  parseCityStateLocation,
  type ParsedUsLocation,
} from "@/lib/sourcing/distance/normalize-place";
import { SKL_DISTANCE_ORIGIN } from "@/lib/sourcing/distance/origin";
import { resolveUsPlace } from "@/lib/sourcing/distance/resolve-us-place";

export type DistanceEstimateSuccess = {
  ok: true;
  miles: number;
  milesRaw: number;
  method: typeof SKL_DISTANCE_ORIGIN.method;
  methodLabel: typeof SKL_DISTANCE_ORIGIN.methodLabel;
  origin: {
    label: string;
    latitude: number;
    longitude: number;
  };
  resolved: {
    city: string;
    state: string;
    display: string;
    latitude: number;
    longitude: number;
    gazetteerKey: string;
  };
  rawLocation: string;
  evidenceText: string;
};

export type DistanceEstimateFailureReason =
  | Extract<ParsedUsLocation, { ok: false }>["reason"]
  | "place_not_found";

export type DistanceEstimateFailure = {
  ok: false;
  reason: DistanceEstimateFailureReason;
  rawLocation: string;
  parsedDisplay: string | null;
  methodLabel: typeof SKL_DISTANCE_ORIGIN.methodLabel;
  evidenceText: string;
};

export type DistanceEstimateResult = DistanceEstimateSuccess | DistanceEstimateFailure;

function failureEvidence(
  raw: string,
  reason: DistanceEstimateFailure["reason"],
  parsedDisplay: string | null
): string {
  const detail =
    reason === "empty"
      ? "empty location"
      : reason === "missing_state"
        ? "state required with city (city-only match refused)"
        : reason === "missing_city"
          ? "city missing"
          : reason === "non_us_state"
            ? "non-U.S. or unrecognized state (offline U.S. Census places only)"
            : reason === "malformed"
              ? "malformed location"
              : reason === "place_not_found"
                ? `U.S. place not found in Census 2024 gazetteer${
                    parsedDisplay ? ` (${parsedDisplay})` : ""
                  }`
                : reason;
  return [
    `${SKL_DISTANCE_ORIGIN.methodLabel}: unresolved`,
    `raw="${raw || "(empty)"}"`,
    `reason=${detail}`,
    `origin=${SKL_DISTANCE_ORIGIN.label} (${SKL_DISTANCE_ORIGIN.latitude}, ${SKL_DISTANCE_ORIGIN.longitude})`,
    "source=US Census 2024 National Places Gazetteer (bundled, offline)",
  ].join("; ");
}

/**
 * Offline estimated straight-line miles from Joplin, MO to a workbook location.
 * Deterministic; no network, geocoder, or provider calls.
 */
export function estimateDistanceFromLocation(rawLocation: string): DistanceEstimateResult {
  const raw = String(rawLocation ?? "").trim();
  const parsed = parseCityStateLocation(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.reason,
      rawLocation: raw,
      parsedDisplay: null,
      methodLabel: SKL_DISTANCE_ORIGIN.methodLabel,
      evidenceText: failureEvidence(raw, parsed.reason, null),
    };
  }

  const place = resolveUsPlace(parsed.city, parsed.state);
  if (!place) {
    return {
      ok: false,
      reason: "place_not_found",
      rawLocation: raw,
      parsedDisplay: parsed.display,
      methodLabel: SKL_DISTANCE_ORIGIN.methodLabel,
      evidenceText: failureEvidence(raw, "place_not_found", parsed.display),
    };
  }

  const milesRaw = haversineMiles(
    SKL_DISTANCE_ORIGIN.latitude,
    SKL_DISTANCE_ORIGIN.longitude,
    place.latitude,
    place.longitude
  );
  const miles = roundMilesForClassification(milesRaw);

  const evidenceText = [
    `${SKL_DISTANCE_ORIGIN.methodLabel}: ${miles} mi`,
    `resolved=${place.displayCity}, ${place.state}`,
    `dest=(${place.latitude}, ${place.longitude})`,
    `origin=${SKL_DISTANCE_ORIGIN.label} (${SKL_DISTANCE_ORIGIN.latitude}, ${SKL_DISTANCE_ORIGIN.longitude})`,
    `method=${SKL_DISTANCE_ORIGIN.method}`,
    "source=US Census 2024 National Places Gazetteer (bundled, offline)",
    `raw="${raw}"`,
  ].join("; ");

  return {
    ok: true,
    miles,
    milesRaw,
    method: SKL_DISTANCE_ORIGIN.method,
    methodLabel: SKL_DISTANCE_ORIGIN.methodLabel,
    origin: {
      label: SKL_DISTANCE_ORIGIN.label,
      latitude: SKL_DISTANCE_ORIGIN.latitude,
      longitude: SKL_DISTANCE_ORIGIN.longitude,
    },
    resolved: {
      city: place.displayCity,
      state: place.state,
      display: `${place.displayCity}, ${place.state}`,
      latitude: place.latitude,
      longitude: place.longitude,
      gazetteerKey: place.key,
    },
    rawLocation: raw,
    evidenceText,
  };
}
