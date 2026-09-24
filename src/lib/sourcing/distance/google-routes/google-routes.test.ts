import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDrivingRouteCache,
  isDrivingRouteCacheFresh,
  parseDrivingRouteCache,
} from "@/lib/sourcing/distance/google-routes/cache";
import {
  calculateDrivingDistanceForLead,
  resolveDestinationCoordinates,
} from "@/lib/sourcing/distance/google-routes/calculate";
import {
  computeGoogleRoute,
  parseGoogleDurationSeconds,
  GOOGLE_MAPS_ROUTES_API_KEY_ENV,
  GOOGLE_ROUTES_COMPUTE_URL,
  GOOGLE_ROUTES_FIELD_MASK,
} from "@/lib/sourcing/distance/google-routes/client";
import {
  resetGoogleRoutesDailyCounterForTests,
  tryConsumeGoogleRoutesDailyQuota,
} from "@/lib/sourcing/distance/google-routes/daily-limit";
import {
  resetDrivingDistanceLocksForTests,
  tryAcquireDrivingDistanceLock,
  releaseDrivingDistanceLock,
} from "@/lib/sourcing/distance/google-routes/lock";
import {
  CITY_CENTER_DRIVING_LABEL,
  GOOGLE_ROUTES_CACHE_VERSION,
  GOOGLE_ROUTES_PROVIDER,
} from "@/lib/sourcing/distance/google-routes/types";
import {
  calculateTransportationUsd,
  metersToMiles,
  roundCurrencyUsd,
  roundDrivingMilesForDisplay,
  METERS_PER_MILE,
} from "@/lib/sourcing/distance/google-routes/units";
import {
  DEFAULT_INSPECTION_COST_USD,
  DEFAULT_TRANSPORTATION_RATE_PER_MILE,
  normalizeDefaultInspectionCost,
  normalizeTransportationRatePerMile,
  transportationDefaultFromMiles,
} from "@/lib/sourcing/market-comparison/cost-defaults";
import { SKL_DISTANCE_ORIGIN } from "@/lib/sourcing/distance/origin";
import { listingContentChanged } from "@/lib/sourcing/listing-content";
import { normalizeSpecEvidence } from "@/lib/sourcing/intake/sources";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";
import type { GoogleRoutesComputeResult } from "@/lib/sourcing/distance/google-routes/types";

afterEach(() => {
  resetGoogleRoutesDailyCounterForTests();
  resetDrivingDistanceLocksForTests();
  vi.restoreAllMocks();
});

describe("units and cost defaults", () => {
  it("converts meters to miles with international mile", () => {
    expect(METERS_PER_MILE).toBe(1609.344);
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 10);
    expect(metersToMiles(160 * 1609.344)).toBeCloseTo(160, 10);
  });

  it("rounds display miles and currency", () => {
    expect(roundDrivingMilesForDisplay(159.4)).toBe(159);
    expect(roundDrivingMilesForDisplay(159.5)).toBe(160);
    expect(roundCurrencyUsd(360.004)).toBe(360);
    expect(roundCurrencyUsd(360.005)).toBe(360.01);
  });

  it("160 miles × $2.25 = $360.00", () => {
    expect(calculateTransportationUsd(160, 2.25)).toBe(360);
    expect(transportationDefaultFromMiles(160)).toBe(360);
  });

  it("uses default inspection $230 and custom rate/inspection", () => {
    expect(DEFAULT_INSPECTION_COST_USD).toBe(230);
    expect(DEFAULT_TRANSPORTATION_RATE_PER_MILE).toBe(2.25);
    expect(normalizeDefaultInspectionCost(undefined)).toBe(230);
    expect(normalizeDefaultInspectionCost(-1)).toBe(230);
    expect(normalizeDefaultInspectionCost(275.5)).toBe(275.5);
    expect(normalizeTransportationRatePerMile(3)).toBe(3);
    expect(calculateTransportationUsd(100, 3)).toBe(300);
    expect(DEFAULT_BUYING_PROFILE.transportationRatePerMile).toBe(2.25);
    expect(DEFAULT_BUYING_PROFILE.defaultInspectionCost).toBe(230);
  });
});

describe("cache fingerprint", () => {
  it("parses and validates cache; destination change invalidates", () => {
    const cache = buildDrivingRouteCache({
      distanceMeters: 160 * 1609.344,
      durationSeconds: 9000,
      destLat: 39.0997,
      destLng: -94.5786,
      calculatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(cache.provider).toBe(GOOGLE_ROUTES_PROVIDER);
    expect(cache.version).toBe(GOOGLE_ROUTES_CACHE_VERSION);
    expect(cache.methodLabel).toBe(CITY_CENTER_DRIVING_LABEL);
    expect(cache.originLat).toBe(SKL_DISTANCE_ORIGIN.latitude);
    expect(isDrivingRouteCacheFresh(cache, 39.0997, -94.5786)).toBe(true);
    expect(isDrivingRouteCacheFresh(cache, 40, -94.5786)).toBe(false);
    expect(parseDrivingRouteCache(cache)).toEqual(cache);
    expect(parseDrivingRouteCache({ ...cache, version: "old" })).toBeNull();
  });

  it("round-trips through normalizeSpecEvidence without dropping drivingRoute", () => {
    const cache = buildDrivingRouteCache({
      distanceMeters: 10000,
      durationSeconds: 600,
      destLat: 38.6,
      destLng: -90.2,
    });
    const normalized = normalizeSpecEvidence({
      distance: "straight-line evidence",
      drivingRoute: cache,
      inspectionUrl: "https://example.com/i",
    });
    expect(normalized.drivingRoute).toEqual(cache);
    expect(normalized.distance).toContain("straight-line");
  });
});

describe("Google Routes client (mocked fetch)", () => {
  it("sends field mask and DRIVE / TRAFFIC_UNAWARE; parses duration", async () => {
    expect(parseGoogleDurationSeconds("3723s")).toBe(3723);
    const fetchImpl = vi.fn(async () =>
      Response.json({
        routes: [{ distanceMeters: 257495, duration: "10800s" }],
      })
    );
    const result = await computeGoogleRoute({
      originLat: SKL_DISTANCE_ORIGIN.latitude,
      originLng: SKL_DISTANCE_ORIGIN.longitude,
      destLat: 39.1,
      destLng: -94.5,
      apiKey: "test-key-not-for-production",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.distanceMeters).toBe(257495);
      expect(result.durationSeconds).toBe(10800);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe(GOOGLE_ROUTES_COMPUTE_URL);
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test-key-not-for-production");
    expect(headers["X-Goog-FieldMask"]).toBe(GOOGLE_ROUTES_FIELD_MASK);
    const body = JSON.parse(String(init.body));
    expect(body.travelMode).toBe("DRIVE");
    expect(body.routingPreference).toBe("TRAFFIC_UNAWARE");
    expect(body.computeAlternativeRoutes).toBe(false);
  });

  it("categorizes 401/403, 429, 5xx, no route, malformed", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cases: Array<{ status?: number; json?: unknown; category: string }> = [
      { status: 401, category: "auth" },
      { status: 403, category: "auth" },
      { status: 429, category: "quota" },
      { status: 503, category: "provider" },
      { status: 200, json: { routes: [] }, category: "no_route" },
      { status: 200, json: { routes: [{ distanceMeters: "x" }] }, category: "malformed" },
    ];
    for (const c of cases) {
      const fetchImpl = vi.fn(async () => {
        if (c.status && c.status >= 400) {
          return new Response("err", { status: c.status });
        }
        return Response.json(c.json);
      });
      const result = await computeGoogleRoute({
        originLat: 1,
        originLng: 2,
        destLat: 3,
        destLng: 4,
        apiKey: "k",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.category).toBe(c.category);
      expect(JSON.stringify(result)).not.toMatch(/GOOGLE_MAPS|apiKey|X-Goog/i);
    }
    expect(consoleSpy.mock.calls.length).toBeGreaterThan(0);
    for (const call of consoleSpy.mock.calls) {
      const line = String(call[0] ?? "");
      expect(line).not.toMatch(/X-Goog|apiKey|GOOGLE_MAPS/i);
      if (line.includes("google_routes_failed")) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        expect(parsed.event).toBe("google_routes_failed");
        expect(parsed.provider).toBe("google_routes");
      }
    }
  });

  it("handles timeout via AbortError", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const result = await computeGoogleRoute({
      originLat: 1,
      originLng: 2,
      destLat: 3,
      destLng: 4,
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe("timeout");
    const line = String(consoleSpy.mock.calls[0]?.[0] ?? "");
    expect(JSON.parse(line).failureStage).toBe("request");
    expect(JSON.parse(line).httpStatus).toBeNull();
  });
});

describe("calculateDrivingDistanceForLead", () => {
  const joplinAreaLocation = "Kansas City, MO";

  it("resolves Census destination coordinates offline", () => {
    const dest = resolveDestinationCoordinates(joplinAreaLocation);
    expect(dest.ok).toBe(true);
  });

  it("reuses fresh cache with zero provider calls", async () => {
    const dest = resolveDestinationCoordinates(joplinAreaLocation);
    expect(dest.ok).toBe(true);
    if (!dest.ok) return;
    const cache = buildDrivingRouteCache({
      distanceMeters: 160 * 1609.344,
      durationSeconds: 9000,
      destLat: dest.lat,
      destLng: dest.lng,
    });
    const computeRoute = vi.fn(async (): Promise<GoogleRoutesComputeResult> => {
      throw new Error("should not call provider");
    });
    const result = await calculateDrivingDistanceForLead({
      leadId: "lead-1",
      location: joplinAreaLocation,
      straightLineMiles: 140,
      specEvidence: { drivingRoute: cache },
      holderEmail: "admin@example.com",
      computeRoute,
      apiKey: "k",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage.requestCount).toBe(0);
      expect(result.usage.cached).toBe(true);
      expect(result.message).toMatch(/saved driving-distance/i);
      expect(result.transportationDefaultUsd).toBe(360);
      expect(result.displayMiles).toBe(160);
    }
    expect(computeRoute).not.toHaveBeenCalled();
  });

  it("successful Google route returns miles and transportation default", async () => {
    const computeRoute = vi.fn(async (): Promise<GoogleRoutesComputeResult> => ({
      ok: true,
      distanceMeters: 160 * 1609.344,
      durationSeconds: 7200,
    }));
    const result = await calculateDrivingDistanceForLead({
      leadId: "lead-2",
      location: joplinAreaLocation,
      straightLineMiles: 140,
      specEvidence: {},
      holderEmail: "admin@example.com",
      computeRoute,
      apiKey: "k",
      env: {
        NODE_ENV: "test",
        [GOOGLE_MAPS_ROUTES_API_KEY_ENV]: "k",
        GOOGLE_ROUTES_DAILY_LIMIT: "50",
      } as NodeJS.ProcessEnv,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage.requestCount).toBe(1);
      expect(result.cacheToPersist).toBeTruthy();
      expect(result.transportationDefaultUsd).toBe(360);
    }
    expect(computeRoute).toHaveBeenCalledTimes(1);
  });

  it("changed destination invalidates cache and calls provider", async () => {
    const stale = buildDrivingRouteCache({
      distanceMeters: 1000,
      durationSeconds: 100,
      destLat: 1,
      destLng: 1,
    });
    const computeRoute = vi.fn(async (): Promise<GoogleRoutesComputeResult> => ({
      ok: true,
      distanceMeters: 5000,
      durationSeconds: 200,
    }));
    const result = await calculateDrivingDistanceForLead({
      leadId: "lead-3",
      location: joplinAreaLocation,
      straightLineMiles: 140,
      specEvidence: { drivingRoute: stale },
      holderEmail: "admin@example.com",
      computeRoute,
      apiKey: "k",
    });
    expect(result.ok).toBe(true);
    expect(computeRoute).toHaveBeenCalledTimes(1);
  });

  it("missing destination coordinates fails closed", async () => {
    const result = await calculateDrivingDistanceForLead({
      leadId: "lead-4",
      location: "",
      straightLineMiles: null,
      specEvidence: {},
      holderEmail: "admin@example.com",
      apiKey: "k",
      computeRoute: vi.fn(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failureCategory).toBe("missing_destination");
  });

  it("no route / auth / quota / missing key leave straight-line unchanged", async () => {
    const straight = 142;
    for (const category of ["no_route", "auth", "quota"] as const) {
      resetDrivingDistanceLocksForTests();
      const computeRoute = vi.fn(async (): Promise<GoogleRoutesComputeResult> => ({
        ok: false,
        category,
        message: "fail",
      }));
      const result = await calculateDrivingDistanceForLead({
        leadId: `lead-${category}`,
        location: joplinAreaLocation,
        straightLineMiles: straight,
        specEvidence: {},
        holderEmail: "admin@example.com",
        computeRoute,
        apiKey: "k",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.straightLineMiles).toBe(straight);
        expect(result.error).toMatch(/Transportation|Driving distance/i);
      }
    }
    const missingKey = await calculateDrivingDistanceForLead({
      leadId: "lead-nokey",
      location: joplinAreaLocation,
      straightLineMiles: straight,
      specEvidence: {},
      holderEmail: "admin@example.com",
      apiKey: null,
    });
    expect(missingKey.ok).toBe(false);
    if (!missingKey.ok) expect(missingKey.failureCategory).toBe("missing_key");
  });

  it("duplicate-click / concurrency lock protects one active calc per lead+route", () => {
    const key = "lead-busy|39.10000|-94.50000|google_routes_v1";
    const lock1 = tryAcquireDrivingDistanceLock(key, "a@example.com");
    expect(lock1.ok).toBe(true);
    const lock2 = tryAcquireDrivingDistanceLock(key, "b@example.com");
    expect(lock2.ok).toBe(false);
    const lockDup = tryAcquireDrivingDistanceLock(key, "a@example.com");
    expect(lockDup.ok).toBe(false);
    releaseDrivingDistanceLock(key, "a@example.com");
    const lock3 = tryAcquireDrivingDistanceLock(key, "b@example.com");
    expect(lock3.ok).toBe(true);
  });

  it("daily limit blocks further provider calls", () => {
    const env = { NODE_ENV: "test", GOOGLE_ROUTES_DAILY_LIMIT: "1" } as NodeJS.ProcessEnv;
    expect(tryConsumeGoogleRoutesDailyQuota(env).ok).toBe(true);
    const second = tryConsumeGoogleRoutesDailyQuota(env);
    expect(second.ok).toBe(false);
  });
});

describe("classification / listing content isolation", () => {
  it("drivingRoute enrichment does not create a listing content change", () => {
    const base = {
      seller: "Penske",
      sourceUrl: "https://example.com/1",
      sourceScope: "penske",
      sourceListingId: "1",
      canonicalListingUrl: "https://example.com/1",
      stockNumber: "1",
      vin: "",
      year: 2020,
      makeModel: "Isuzu",
      boxLengthFt: 26,
      boxLengthRaw: "26",
      engine: "Cummins",
      engineIsCummins: true,
      transmission: "Auto",
      transmissionIsAutomatic: true,
      listedWeightLbs: null,
      listedWeightTerm: "unknown" as const,
      manufacturerGvwrLbs: 25999,
      gvwrDoorPlateVerified: false,
      mileage: 100000,
      hasLiftgate: true,
      liftgateNotes: "",
      price: 45000,
      location: "Kansas City, MO",
      drivingDistanceMiles: 140,
      distanceIsEstimate: true,
      specEvidence: { distance: "straight-line", drivingRoute: null },
    };
    const withRoute = {
      ...base,
      specEvidence: {
        distance: "straight-line",
        drivingRoute: buildDrivingRouteCache({
          distanceMeters: 200000,
          durationSeconds: 1000,
          destLat: 39.1,
          destLng: -94.5,
        }),
      },
    };
    expect(
      listingContentChanged(
        base as Parameters<typeof listingContentChanged>[0],
        withRoute as Parameters<typeof listingContentChanged>[0]
      )
    ).toBe(false);
    expect(withRoute.drivingDistanceMiles).toBe(140);
    expect(withRoute.distanceIsEstimate).toBe(true);
  });
});
