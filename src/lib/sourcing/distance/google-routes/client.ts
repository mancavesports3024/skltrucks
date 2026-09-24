import "server-only";

import {
  logGoogleRoutesFailure,
  parseGoogleErrorResponseText,
} from "@/lib/sourcing/distance/google-routes/diagnostics";
import type {
  GoogleRoutesComputeResult,
  GoogleRoutesFailureCategory,
} from "@/lib/sourcing/distance/google-routes/types";

/** Hardcoded Google Routes API computeRoutes endpoint — never user-supplied. */
export const GOOGLE_ROUTES_COMPUTE_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

/** Field mask — distance + duration only (no polyline / steps). */
export const GOOGLE_ROUTES_FIELD_MASK = "routes.distanceMeters,routes.duration";

export const GOOGLE_ROUTES_TIMEOUT_MS = 8_000;

/** Bound response body before JSON parse (~256 KiB). */
export const GOOGLE_ROUTES_MAX_RESPONSE_BYTES = 262_144;

/**
 * Reject absurd distances (continental US city-center routes are far below this).
 * ~6,213 miles ≈ 10,000 km.
 */
export const GOOGLE_ROUTES_MAX_DISTANCE_METERS = 10_000_000;

export const GOOGLE_MAPS_ROUTES_API_KEY_ENV = "GOOGLE_MAPS_ROUTES_API_KEY";

export function getGoogleMapsRoutesApiKey(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const key = String(env[GOOGLE_MAPS_ROUTES_API_KEY_ENV] ?? "").trim();
  return key || null;
}

/** Parse Google duration string like "3723s" → seconds. */
export function parseGoogleDurationSeconds(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  const s = String(raw).trim();
  const m = /^(\d+(?:\.\d+)?)s$/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function categorizeHttpStatus(status: number): GoogleRoutesFailureCategory {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "quota";
  if (status >= 500) return "provider";
  return "provider";
}

function staffSafeHttpMessage(status: number, category: GoogleRoutesFailureCategory): string {
  if (category === "auth") {
    return "Driving-distance provider authentication failed. Check server configuration.";
  }
  if (category === "quota") {
    return "Driving-distance provider quota exceeded. Try again later or enter Transportation manually.";
  }
  if (status === 0) {
    return "Driving-distance provider timed out. Enter Transportation manually.";
  }
  return "Driving-distance provider error. Enter Transportation manually.";
}

export type ComputeRoutesRequest = {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Call Google Routes computeRoutes (DRIVE, TRAFFIC_UNAWARE).
 * - Endpoint hostname/path are hardcoded constants.
 * - API key sent only in X-Goog-Api-Key (never logged).
 * - Redirects rejected; response size bounded; timeout enforced.
 * - Only distanceMeters + duration accepted; multi-route responses use routes[0] deterministically.
 */
export async function computeGoogleRoute(
  input: ComputeRoutesRequest
): Promise<GoogleRoutesComputeResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? GOOGLE_ROUTES_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(GOOGLE_ROUTES_COMPUTE_URL, {
      method: "POST",
      signal: controller.signal,
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": input.apiKey,
        "X-Goog-FieldMask": GOOGLE_ROUTES_FIELD_MASK,
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: input.originLat,
              longitude: input.originLng,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: input.destLat,
              longitude: input.destLng,
            },
          },
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        computeAlternativeRoutes: false,
        languageCode: "en-US",
        units: "METRIC",
      }),
    });

    if (!res.ok) {
      const category = categorizeHttpStatus(res.status);
      let googleErrorStatus: string | null = null;
      let googleErrorReason: string | null = null;
      let googleErrorMessage: string | null = null;
      try {
        const errText = await res.text();
        const extracted = parseGoogleErrorResponseText(errText);
        googleErrorStatus = extracted.status;
        googleErrorReason = extracted.reason;
        googleErrorMessage = extracted.message;
      } catch {
        /* ignore — never log body/headers */
      }
      logGoogleRoutesFailure({
        httpStatus: res.status,
        googleErrorStatus,
        googleErrorReason,
        googleErrorMessage,
        failureStage: "request",
      });
      return {
        ok: false,
        category: category === "auth" || category === "quota" ? category : "provider",
        message: staffSafeHttpMessage(res.status, category),
      };
    }

    let rawText: string;
    try {
      rawText = await res.text();
    } catch {
      logGoogleRoutesFailure({
        httpStatus: res.status,
        failureStage: "response_validation",
        googleErrorMessage: "unreadable_response_body",
      });
      return {
        ok: false,
        category: "malformed",
        message: "Driving-distance provider returned an unreadable response.",
      };
    }

    if (rawText.length > GOOGLE_ROUTES_MAX_RESPONSE_BYTES) {
      logGoogleRoutesFailure({
        httpStatus: res.status,
        failureStage: "response_validation",
        googleErrorMessage: "oversized_response",
      });
      return {
        ok: false,
        category: "malformed",
        message: "Driving-distance provider returned an oversized response.",
      };
    }

    let json: unknown;
    try {
      json = JSON.parse(rawText) as unknown;
    } catch {
      logGoogleRoutesFailure({
        httpStatus: res.status,
        failureStage: "response_validation",
        googleErrorMessage: "invalid_json",
      });
      return {
        ok: false,
        category: "malformed",
        message: "Driving-distance provider returned an unreadable response.",
      };
    }

    if (!json || typeof json !== "object") {
      logGoogleRoutesFailure({
        httpStatus: res.status,
        failureStage: "response_validation",
        googleErrorMessage: "non_object_json",
      });
      return {
        ok: false,
        category: "malformed",
        message: "Driving-distance provider returned an unreadable response.",
      };
    }

    const routes = (json as { routes?: unknown }).routes;
    if (!Array.isArray(routes) || routes.length === 0) {
      logGoogleRoutesFailure({
        httpStatus: res.status,
        failureStage: "response_validation",
        googleErrorMessage: "empty_routes",
      });
      return {
        ok: false,
        category: "no_route",
        message: "No driving route found between origin and destination.",
      };
    }

    // Deterministic: always use first route when computeAlternativeRoutes is false
    // (Google may still return a one-element array). Extra routes are ignored.
    const first = routes[0];
    if (!first || typeof first !== "object") {
      logGoogleRoutesFailure({
        httpStatus: res.status,
        failureStage: "response_validation",
        googleErrorMessage: "invalid_route_entry",
      });
      return {
        ok: false,
        category: "malformed",
        message: "Driving-distance provider returned an unreadable response.",
      };
    }

    const distanceMeters = Number((first as { distanceMeters?: unknown }).distanceMeters);
    if (
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0 ||
      distanceMeters > GOOGLE_ROUTES_MAX_DISTANCE_METERS
    ) {
      logGoogleRoutesFailure({
        httpStatus: res.status,
        failureStage: "response_validation",
        googleErrorMessage: "unusable_distance",
      });
      return {
        ok: false,
        category: "malformed",
        message: "Driving-distance provider returned an unusable distance.",
      };
    }

    const durationSeconds = parseGoogleDurationSeconds(
      (first as { duration?: unknown }).duration
    );
    // Duration is optional; invalid format fails closed only when present and unparsable.
    const durationRaw = (first as { duration?: unknown }).duration;
    if (durationRaw != null && durationRaw !== "" && durationSeconds == null) {
      logGoogleRoutesFailure({
        httpStatus: res.status,
        failureStage: "response_validation",
        googleErrorMessage: "unreadable_duration",
      });
      return {
        ok: false,
        category: "malformed",
        message: "Driving-distance provider returned an unreadable duration.",
      };
    }

    return { ok: true, distanceMeters, durationSeconds };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : "";
    if (name === "AbortError" || name === "TimeoutError") {
      logGoogleRoutesFailure({
        httpStatus: null,
        failureStage: "request",
        googleErrorMessage: "request_timeout",
      });
      return {
        ok: false,
        category: "timeout",
        message: staffSafeHttpMessage(0, "timeout"),
      };
    }
    // redirect: 'error' surfaces as TypeError / Failed to fetch in some runtimes
    if (/redirect/i.test(message)) {
      logGoogleRoutesFailure({
        httpStatus: null,
        failureStage: "request",
        googleErrorMessage: "redirect_rejected",
      });
      return {
        ok: false,
        category: "provider",
        message: "Driving-distance provider error. Enter Transportation manually.",
      };
    }
    logGoogleRoutesFailure({
      httpStatus: null,
      failureStage: "request",
      googleErrorMessage: "request_exception",
    });
    return {
      ok: false,
      category: "provider",
      message: "Driving-distance provider error. Enter Transportation manually.",
    };
  } finally {
    clearTimeout(timer);
  }
}
