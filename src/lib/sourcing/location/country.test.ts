import { describe, expect, it, vi } from "vitest";
import { estimateDistanceFromLocation } from "@/lib/sourcing/distance/estimate-from-location";
import { applyOfflineWorkbookDistance } from "@/lib/sourcing/intake/workbook/to-intake";
import { parseOsLocation } from "@/lib/sourcing/intake/workbook/normalize";
import {
  CANADA,
  UNITED_STATES,
  countryRejectionReason,
  normalizeExplicitCountryField,
  resolveLeadCountry,
  shouldSkipUsDistanceLookup,
} from "@/lib/sourcing/location/country";
import { classifyLead, type LeadMatchInput } from "@/lib/sourcing/match";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

const asOf = new Date("2026-09-22T12:00:00Z");

function usEligibleLead(over: Partial<LeadMatchInput> = {}): LeadMatchInput {
  return {
    year: 2019,
    boxLengthFt: 26,
    engineIsCummins: true,
    transmissionIsAutomatic: true,
    listedWeightLbs: null,
    listedWeightTerm: "gvwr",
    manufacturerGvwrLbs: 25500,
    gvwrDoorPlateVerified: false,
    mileage: 100000,
    hasLiftgate: true,
    drivingDistanceMiles: 500,
    distanceIsEstimate: true,
    price: 40000,
    location: "Kansas City, MO",
    ...over,
  };
}

describe("resolveLeadCountry", () => {
  it("treats Toronto, ON and Canada as Canada", () => {
    expect(resolveLeadCountry({ location: "Toronto, ON" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
    expect(resolveLeadCountry({ location: "Canada" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
    expect(resolveLeadCountry({ country: "CAN" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
  });

  it("rejects Ontario province without explicit country word", () => {
    expect(resolveLeadCountry({ location: "Mississauga, ON" }).kind).toBe("foreign");
    expect(resolveLeadCountry({ stateOrProvince: "ON" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
  });

  it("recognizes BC / Quebec abbreviations and full names", () => {
    expect(resolveLeadCountry({ location: "Vancouver, BC" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
    expect(resolveLeadCountry({ location: "Vancouver, British Columbia" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
    expect(resolveLeadCountry({ location: "Montreal, QC" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
    expect(resolveLeadCountry({ location: "Montreal, Quebec" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
    expect(resolveLeadCountry({ location: "Quebec City, PQ" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
  });

  it("treats Los Angeles, CA in a state field as California / United States", () => {
    expect(resolveLeadCountry({ location: "Los Angeles, CA" })).toEqual({
      kind: "us",
      country: UNITED_STATES,
    });
    expect(resolveLeadCountry({ stateOrProvince: "CA" })).toEqual({
      kind: "us",
      country: UNITED_STATES,
    });
  });

  it("treats CA in an explicit country field as Canada", () => {
    expect(normalizeExplicitCountryField("CA")).toEqual({
      kind: "foreign",
      country: CANADA,
    });
    expect(resolveLeadCountry({ country: "CA" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
    expect(resolveLeadCountry({ location: "Toronto", country: "CA" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
  });

  it("rejects explicit Mexico / other non-U.S. countries", () => {
    expect(resolveLeadCountry({ country: "Mexico" })).toEqual({
      kind: "foreign",
      country: "Mexico",
    });
    expect(resolveLeadCountry({ location: "Monterrey, Mexico" })).toEqual({
      kind: "foreign",
      country: "Mexico",
    });
    expect(resolveLeadCountry({ country: "Germany" })).toEqual({
      kind: "foreign",
      country: "Germany",
    });
  });

  it("leaves missing or unrecognized country/location unknown", () => {
    expect(resolveLeadCountry({ location: "" }).kind).toBe("unknown");
    expect(resolveLeadCountry({ location: "Springfield" }).kind).toBe("unknown");
    expect(resolveLeadCountry({ location: "Atlantis, ZZ" }).kind).toBe("unknown");
  });

  it("normalizes USA / US / U.S. / United States aliases", () => {
    for (const country of [
      "USA",
      "US",
      "U.S.",
      "United States",
      "United States of America",
    ]) {
      expect(resolveLeadCountry({ country }), country).toEqual({
        kind: "us",
        country: UNITED_STATES,
      });
    }
    expect(resolveLeadCountry({ location: "Dallas, TX, USA" }).kind).toBe("us");
  });
  it("treats New Castle, DE as Delaware / United States (not Germany)", () => {
    expect(resolveLeadCountry({ location: "NEW CASTLE, DE" })).toEqual({
      kind: "us",
      country: UNITED_STATES,
    });
  });

  it("still rejects country-field DE as Germany", () => {
    expect(resolveLeadCountry({ country: "DE" })).toEqual({
      kind: "foreign",
      country: "Germany",
    });
  });

  it("does not false-positive U.S. cities that share foreign place names", () => {
    expect(resolveLeadCountry({ location: "Ontario, CA" })).toEqual({
      kind: "us",
      country: UNITED_STATES,
    });
    expect(resolveLeadCountry({ location: "Mexico, MO" })).toEqual({
      kind: "us",
      country: UNITED_STATES,
    });
    expect(resolveLeadCountry({ location: "California, MO" })).toEqual({
      kind: "us",
      country: UNITED_STATES,
    });
    expect(resolveLeadCountry({ location: "Toronto, OH" })).toEqual({
      kind: "us",
      country: UNITED_STATES,
    });
    expect(resolveLeadCountry({ location: "Vancouver, WA" })).toEqual({
      kind: "us",
      country: UNITED_STATES,
    });
    expect(resolveLeadCountry({ location: "London, KY" })).toEqual({
      kind: "us",
      country: UNITED_STATES,
    });
    expect(resolveLeadCountry({ location: "Paris, TX" })).toEqual({
      kind: "us",
      country: UNITED_STATES,
    });
  });

  it("rejects Ontario, Canada and province ON while keeping CA country vs state rules", () => {
    expect(resolveLeadCountry({ location: "Ontario, Canada" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
    expect(resolveLeadCountry({ stateOrProvince: "ON" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
    expect(resolveLeadCountry({ country: "CA" }).kind).toBe("foreign");
    expect(resolveLeadCountry({ stateOrProvince: "CA" }).kind).toBe("us");
  });

  it("gives dedicated country field precedence only when provided", () => {
    expect(resolveLeadCountry({ location: "Los Angeles, CA", country: "CA" })).toEqual({
      kind: "foreign",
      country: CANADA,
    });
    expect(resolveLeadCountry({ location: "Los Angeles, CA" })).toEqual({
      kind: "us",
      country: UNITED_STATES,
    });
  });

  it("never rejects free-form city names alone as foreign countries", () => {
    expect(resolveLeadCountry({ location: "Toronto" }).kind).toBe("unknown");
    expect(resolveLeadCountry({ location: "Ontario" }).kind).toBe("unknown");
    expect(resolveLeadCountry({ location: "Mexico" }).kind).toBe("unknown");
    expect(resolveLeadCountry({ location: "Quebec" }).kind).toBe("unknown");
    expect(resolveLeadCountry({ location: "Vancouver" }).kind).toBe("unknown");
  });
});

describe("parseOsLocation Canadian detection", () => {
  it("flags Canadian Hogan OS locations and keeps U.S. yards", () => {
    const kc = parseOsLocation("31 - Kansas City, MO");
    expect(kc.looksCanadian).toBe(false);
    expect(kc.country).toBe(UNITED_STATES);
    const on = parseOsLocation("99 - Toronto, ON");
    expect(on.looksCanadian).toBe(true);
    expect(on.country).toBe(CANADA);
    const pei = parseOsLocation("12 - Charlottetown, PE");
    expect(pei.looksCanadian).toBe(true);
  });
});

describe("classifyLead country rule", () => {
  it("rejects Toronto, ON and Canada with Outside allowed country: Canada", () => {
    for (const location of ["Toronto, ON", "Canada"]) {
      const r = classifyLead(usEligibleLead({ location, drivingDistanceMiles: null }), DEFAULT_BUYING_PROFILE, asOf);
      expect(r.status, location).toBe("does_not_match");
      const country = r.reasons.find((x) => x.code === "country");
      expect(country?.outcome).toBe("fail");
      expect(country?.label).toBe(countryRejectionReason(CANADA));
      const distance = r.reasons.find((x) => x.code === "distance");
      expect(distance?.label).not.toMatch(/unknown — not invented/i);
      expect(distance?.label).toMatch(/not evaluated/i);
    }
  });

  it("rejects Ontario province-only and BC/Quebec", () => {
    for (const location of [
      "London, ON",
      "Vancouver, BC",
      "Victoria, British Columbia",
      "Montreal, QC",
      "Quebec, Quebec",
    ]) {
      const r = classifyLead(usEligibleLead({ location, drivingDistanceMiles: null }), DEFAULT_BUYING_PROFILE, asOf);
      expect(r.status, location).toBe("does_not_match");
      expect(r.reasons.find((x) => x.code === "country")?.label).toBe(
        countryRejectionReason(CANADA)
      );
    }
  });

  it("keeps Los Angeles, CA as United States when other specs pass", () => {
    const r = classifyLead(
      usEligibleLead({ location: "Los Angeles, CA", drivingDistanceMiles: 1500 }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(r.reasons.find((x) => x.code === "country")?.outcome).toBe("pass");
    // Distance may still fail for miles — country must not reject California
    expect(r.reasons.find((x) => x.code === "country")?.label).toMatch(/United States/);
  });

  it("rejects CA country field as Canada", () => {
    const r = classifyLead(
      usEligibleLead({ location: "Toronto", country: "CA", drivingDistanceMiles: null }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(r.status).toBe("does_not_match");
    expect(r.reasons.find((x) => x.code === "country")?.label).toBe(
      countryRejectionReason(CANADA)
    );
  });

  it("rejects Mexico", () => {
    const r = classifyLead(
      usEligibleLead({ location: "Monterrey, Mexico", drivingDistanceMiles: null }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(r.status).toBe("does_not_match");
    expect(r.reasons.find((x) => x.code === "country")?.label).toBe(
      countryRejectionReason("Mexico")
    );
  });

  it("needs verification for unknown city/state without inventing foreign", () => {
    const r = classifyLead(
      usEligibleLead({ location: "Unknownville, ZZ", drivingDistanceMiles: null }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(r.status).toBe("needs_verification");
    expect(r.reasons.find((x) => x.code === "country")?.outcome).toBe("unknown");
  });

  it("keeps valid U.S. locations confirmed when other rules pass", () => {
    const r = classifyLead(usEligibleLead({ location: "Joplin, MO" }), DEFAULT_BUYING_PROFILE, asOf);
    expect(r.status).toBe("confirmed_match");
    expect(r.reasons.find((x) => x.code === "country")?.outcome).toBe("pass");
    expect(r.reasons.find((x) => x.code === "gvwr")?.outcome).toBe("pass");
    expect(r.reasons.find((x) => x.code === "distance")?.outcome).toBe("pass");
  });

  it("does not change GVWR / mileage / age / box / engine / transmission outcomes", () => {
    const r = classifyLead(
      usEligibleLead({
        location: "Toronto, ON",
        manufacturerGvwrLbs: 26001,
        mileage: 300000,
        year: 2010,
        boxLengthFt: 30,
        engineIsCummins: false,
        transmissionIsAutomatic: false,
        drivingDistanceMiles: null,
      }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(r.reasons.find((x) => x.code === "gvwr")?.outcome).toBe("fail");
    expect(r.reasons.find((x) => x.code === "mileage")?.outcome).toBe("fail");
    expect(r.reasons.find((x) => x.code === "age")?.outcome).toBe("fail");
    expect(r.reasons.find((x) => x.code === "box_length")?.outcome).toBe("fail");
    expect(r.reasons.find((x) => x.code === "cummins")?.outcome).toBe("fail");
    expect(r.reasons.find((x) => x.code === "automatic")?.outcome).toBe("fail");
    expect(r.reasons.find((x) => x.code === "country")?.outcome).toBe("fail");
  });
});

describe("foreign location skips Census distance and network", () => {
  it("skips U.S. Census lookup for Canada and makes no fetch calls", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation(() => {
      throw new Error("network should not be called");
    });
    expect(shouldSkipUsDistanceLookup(resolveLeadCountry({ location: "Toronto, ON" }))).toBe(
      true
    );
    const applied = applyOfflineWorkbookDistance("Toronto, ON", {}, []);
    expect(applied.missingDistance).toBe(false);
    expect(applied.drivingDistanceMiles).toBeNull();
    expect(applied.distanceSummary).toMatch(/Outside allowed country: Canada/);
    expect(applied.distanceSummary).not.toMatch(/^Distance unknown/);
    expect(applied.evidence.country).toBe(CANADA);
    // Still callable locally but must not use network for foreign skip path
    estimateDistanceFromLocation("Toronto, ON");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
