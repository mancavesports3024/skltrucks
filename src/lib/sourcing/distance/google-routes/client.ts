import "server-only";

import type {
  GoogleRoutesComputeResult,
  GoogleRoutesFailureCategory,
} from "@/lib/sourcing/distance/google-routes/types";

/** Google Routes API computeRoutes endpoint. */
export const GOOGLE_ROUTES_COMPUTE_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

/** Field mask — distance + duration only (no polyline / steps). */
export const GOOGLE_ROUTES_FIELD_MASK = "routes.distanceMeters,routes.duration";

export const GOOGLE_ROUTES_TIMEOUT_MS = 8_000;

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
    return "Driving-distance daily or provider quota exceeded. Try again later or enter Transportation manually.";
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
 * Sends the API key only in X-Goog-Api-Key. Never logs the key or headers.
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
      // Consume body without logging secrets.
      try {
        await res.text();
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        category: category === "auth" || category === "quota" ? category : "provider",
        message: staffSafeHttpMessage(res.status, category),
      };
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return {
        ok: false,
        category: "malformed",
        message: "Driving-distance provider returned an unreadable response.",
      };
    }

    if (!json || typeof json !== "object") {
      return {
        ok: false,
        category: "malformed",
        message: "Driving-distance provider returned an unreadable response.",
      };
    }

    const routes = (json as { routes?: unknown }).routes;
    if (!Array.isArray(routes) || routes.length === 0) {
      return {
        ok: false,
        category: "no_route",
        message: "No driving route found between origin and destination.",
      };
    }

    const first = routes[0];
    if (!first || typeof first !== "object") {
      return {
        ok: false,
        category: "malformed",
        message: "Driving-distance provider returned an unreadable response.",
      };
    }

    const distanceMeters = Number((first as { distanceMeters?: unknown }).distanceMeters);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
      return {
        ok: false,
        category: "malformed",
        message: "Driving-distance provider returned an unreadable response.",
      };
    }

    const durationSeconds = parseGoogleDurationSeconds(
      (first as { duration?: unknown }).duration
    );

    return { ok: true, distanceMeters, durationSeconds };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      return {
        ok: false,
        category: "timeout",
        message: staffSafeHttpMessage(0, "timeout"),
      };
    }
    return {
      ok: false,
      category: "provider",
      message: "Driving-distance provider error. Enter Transportation manually.",
    };
  } finally {
    clearTimeout(timer);
  }
}
