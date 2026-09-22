import { describe, expect, it, vi } from "vitest";
import {
  estimateDistanceFromLocation,
  haversineMiles,
  normalizeCityName,
  parseCityStateLocation,
  resolveUsPlace,
  roundMilesForClassification,
  SKL_DISTANCE_ORIGIN,
} from "@/lib/sourcing/distance";
import { classifyLead } from "@/lib/sourcing/match";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

describe("haversine", () => {
  it("Joplin to Joplin is approximately zero", () => {
    const miles = haversineMiles(
      SKL_DISTANCE_ORIGIN.latitude,
      SKL_DISTANCE_ORIGIN.longitude,
      SKL_DISTANCE_ORIGIN.latitude,
      SKL_DISTANCE_ORIGIN.longitude
    );
    expect(miles).toBe(0);
    expect(roundMilesForClassification(miles)).toBe(0);
  });

  it("is deterministic for known city pairs", () => {
    const a = haversineMiles(37.07522, -94.50126, 39.12515, -94.55031);
    const b = haversineMiles(37.07522, -94.50126, 39.12515, -94.55031);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(100);
    expect(a).toBeLessThan(200);
  });
});

describe("place normalization", () => {
  it("normalizes case, punctuation, whitespace, St./Saint, Ft./Fort", () => {
    expect(normalizeCityName("  St. Louis ")).toBe("saint louis");
    expect(normalizeCityName("Saint Louis")).toBe("saint louis");
    expect(normalizeCityName("ST LOUIS")).toBe("saint louis");
    expect(normalizeCityName("Ft. Worth")).toBe("fort worth");
    expect(normalizeCityName("Kansas  City!!")).toBe("kansas city");
    expect(normalizeCityName("Kansas City")).toBe("kansas city");
  });

  it("requires city and state together", () => {
    const cityOnly = parseCityStateLocation("Kansas City");
    expect(cityOnly.ok).toBe(false);
    if (!cityOnly.ok) expect(cityOnly.reason).toBe("missing_state");
    const empty = parseCityStateLocation("");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe("empty");
    expect(parseCityStateLocation("Kansas City, MO").ok).toBe(true);
    expect(parseCityStateLocation("31 - Kansas City, MO").ok).toBe(true);
  });

  it("does not accept non-U.S. provinces as states", () => {
    const on = parseCityStateLocation("Toronto, ON");
    expect(on.ok).toBe(false);
    if (!on.ok) expect(on.reason).toBe("non_us_state");
  });
});

describe("offline estimate from Joplin", () => {
  it("resolves Joplin, MO to ~0 miles", () => {
    const r = estimateDistanceFromLocation("Joplin, MO");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.miles).toBe(0);
    expect(r.methodLabel).toBe("Estimated straight-line distance");
    expect(r.evidenceText).toMatch(/Estimated straight-line distance/);
    expect(r.evidenceText).not.toMatch(/driving distance/i);
  });

  it("resolves nearby cities within 1,200 miles", () => {
    for (const loc of [
      "Kansas City, MO",
      "Springfield, MO",
      "Tulsa, OK",
      "Oklahoma City, OK",
      "St. Louis, MO",
    ]) {
      const r = estimateDistanceFromLocation(loc);
      expect(r.ok, loc).toBe(true);
      if (!r.ok) continue;
      expect(r.miles, loc).toBeGreaterThan(0);
      expect(r.miles, loc).toBeLessThanOrEqual(1200);
    }
  });

  it("resolves distant West Coast cities outside 1,200 miles", () => {
    for (const loc of ["Portland, OR", "Tacoma, WA"]) {
      const r = estimateDistanceFromLocation(loc);
      expect(r.ok, loc).toBe(true);
      if (!r.ok) continue;
      expect(r.miles, loc).toBeGreaterThan(1200);
    }
  });

  it("resolves Census balance / New England Town city forms", () => {
    const indy = estimateDistanceFromLocation("Indianapolis, IN");
    expect(indy.ok).toBe(true);
    if (indy.ok) expect(indy.miles).toBeLessThanOrEqual(1200);
    const braintree = estimateDistanceFromLocation("Braintree, MA");
    expect(braintree.ok).toBe(true);
    if (braintree.ok) expect(braintree.miles).toBeGreaterThan(1200);
  });

  it("leaves missing state, unknown city, malformed, and empty unresolved", () => {
    expect(estimateDistanceFromLocation("Springfield").ok).toBe(false);
    expect(estimateDistanceFromLocation("Atlantis, MO").ok).toBe(false);
    expect(estimateDistanceFromLocation(", MO").ok).toBe(false);
    expect(estimateDistanceFromLocation("").ok).toBe(false);
    expect(estimateDistanceFromLocation("!!!").ok).toBe(false);
  });

  it("normalizes St./Saint and case for lookup", () => {
    const a = estimateDistanceFromLocation("st. louis, mo");
    const b = estimateDistanceFromLocation("Saint Louis, Missouri");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.miles).toBe(b.miles);
  });

  it("never matches on city name alone when state is missing", () => {
    expect(resolveUsPlace("Springfield", "")).toBeNull();
    expect(estimateDistanceFromLocation("Portland").ok).toBe(false);
  });

  it("makes no network calls", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation(() => {
      throw new Error("network should not be called");
    });
    estimateDistanceFromLocation("Kansas City, MO");
    estimateDistanceFromLocation("Nowhere, ZZ");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("classification boundary at 1,200 miles", () => {
  const base = {
    year: 2019,
    boxLengthFt: 26,
    engineIsCummins: true,
    transmissionIsAutomatic: true,
    listedWeightLbs: null as number | null,
    listedWeightTerm: "gvwr" as const,
    manufacturerGvwrLbs: 25500,
    gvwrDoorPlateVerified: false,
    mileage: 100000,
    hasLiftgate: true,
    distanceIsEstimate: true,
    price: 40000,
  };

  it("exactly 1,200 miles passes when profile max is 1,200", () => {
    const r = classifyLead(
      { ...base, drivingDistanceMiles: 1200 },
      DEFAULT_BUYING_PROFILE
    );
    expect(r.reasons.find((x) => x.code === "distance")?.outcome).toBe("pass");
    expect(r.reasons.find((x) => x.code === "distance")?.label).toMatch(
      /Estimated straight-line distance/
    );
    expect(r.status).toBe("confirmed_match");
  });

  it("greater than 1,200 miles rejects for distance", () => {
    const r = classifyLead(
      { ...base, drivingDistanceMiles: 1201 },
      DEFAULT_BUYING_PROFILE
    );
    expect(r.reasons.find((x) => x.code === "distance")?.outcome).toBe("fail");
    expect(r.status).toBe("does_not_match");
  });

  it("unresolved distance stays Needs verification", () => {
    const r = classifyLead(
      { ...base, drivingDistanceMiles: null },
      DEFAULT_BUYING_PROFILE
    );
    expect(r.reasons.find((x) => x.code === "distance")?.outcome).toBe("unknown");
    expect(r.status).toBe("needs_verification");
  });
});
