import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSPECTION_COST_USD,
  DEFAULT_TRANSPORTATION_RATE_PER_MILE,
  MAX_DEFAULT_INSPECTION_COST_USD,
  MAX_TRANSPORTATION_RATE_PER_MILE,
  normalizeDefaultInspectionCost,
  normalizeTransportationRatePerMile,
  parseDefaultInspectionCost,
  parseTransportationRatePerMile,
  transportationDefaultFromMiles,
} from "@/lib/sourcing/market-comparison/cost-defaults";
import { parseBuyingProfileForm } from "@/lib/sourcing/forms";

describe("cost default validation", () => {
  it("accepts defaults and 160 × 2.25 = 360.00", () => {
    expect(parseTransportationRatePerMile(2.25).ok).toBe(true);
    expect(parseDefaultInspectionCost(230).ok).toBe(true);
    expect(transportationDefaultFromMiles(160, 2.25)).toBe(360);
    expect(DEFAULT_TRANSPORTATION_RATE_PER_MILE).toBe(2.25);
    expect(DEFAULT_INSPECTION_COST_USD).toBe(230);
  });

  it("rejects negative, NaN, Infinity, malformed, oversized, excess precision", () => {
    expect(parseTransportationRatePerMile(-1).ok).toBe(false);
    expect(parseTransportationRatePerMile(Number.NaN).ok).toBe(false);
    expect(parseTransportationRatePerMile(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(parseTransportationRatePerMile("abc").ok).toBe(false);
    expect(parseTransportationRatePerMile(MAX_TRANSPORTATION_RATE_PER_MILE + 1).ok).toBe(false);
    expect(parseTransportationRatePerMile(1.23456).ok).toBe(false);

    expect(parseDefaultInspectionCost(-0.01).ok).toBe(false);
    expect(parseDefaultInspectionCost("12.345").ok).toBe(false);
    expect(parseDefaultInspectionCost(MAX_DEFAULT_INSPECTION_COST_USD + 1).ok).toBe(false);
  });

  it("read-path normalize falls back to defaults for missing/invalid", () => {
    expect(normalizeTransportationRatePerMile(undefined)).toBe(2.25);
    expect(normalizeDefaultInspectionCost(null)).toBe(230);
    expect(normalizeTransportationRatePerMile(-5)).toBe(2.25);
  });

  it("parseBuyingProfileForm rejects invalid rate server-side", () => {
    const fd = new FormData();
    fd.set("requireCummins", "on");
    fd.set("requireAutomatic", "on");
    fd.set("requiredBoxLengthsFt", "24,26,28");
    fd.set("maxGvwrLbs", "26000");
    fd.set("maxMileage", "275000");
    fd.set("maxAgeYears", "9");
    fd.set("preferLiftgate", "on");
    fd.set("preferredMaxDrivingMiles", "1200");
    fd.set("originLabel", "Joplin, Missouri");
    fd.set("notes", "");
    fd.set("transportationRatePerMile", "-2");
    fd.set("defaultInspectionCost", "230");
    const parsed = parseBuyingProfileForm(fd);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/negative/i);
  });
});
