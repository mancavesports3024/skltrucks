import { describe, expect, it } from "vitest";
import {
  classifyLead,
  earliestAcceptedModelYear,
  resolveManufacturerGvwrLbs,
  type LeadMatchInput,
} from "@/lib/sourcing/match";
import { DEFAULT_BUYING_PROFILE, type BuyingProfile } from "@/types/sourcing";

const asOf = new Date("2026-09-18T12:00:00Z");

function baseLead(overrides: Partial<LeadMatchInput> = {}): LeadMatchInput {
  return {
    year: 2018,
    boxLengthFt: 26,
    engineIsCummins: true,
    transmissionIsAutomatic: true,
    listedWeightLbs: 25999,
    listedWeightTerm: "gvwr",
    manufacturerGvwrLbs: null,
    gvwrDoorPlateVerified: false,
    mileage: 160000,
    hasLiftgate: true,
    drivingDistanceMiles: 1080,
    price: 33900,
    ...overrides,
  };
}

describe("earliestAcceptedModelYear", () => {
  it("uses a rolling 9-year window from the current calendar year", () => {
    expect(earliestAcceptedModelYear(DEFAULT_BUYING_PROFILE, asOf)).toBe(2017);
    expect(earliestAcceptedModelYear(DEFAULT_BUYING_PROFILE, new Date("2030-01-01"))).toBe(2021);
  });

  it("fails model years older than the rolling window and accepts the boundary year", () => {
    const old = classifyLead(baseLead({ year: 2016 }), DEFAULT_BUYING_PROFILE, asOf);
    expect(old.status).toBe("does_not_match");
    expect(old.reasons.find((r) => r.code === "age")?.outcome).toBe("fail");

    const boundary = classifyLead(baseLead({ year: 2017 }), DEFAULT_BUYING_PROFILE, asOf);
    expect(boundary.reasons.find((r) => r.code === "age")?.outcome).toBe("pass");
    expect(boundary.status).toBe("confirmed_match");
  });
});

describe("GVWR rules", () => {
  it("treats exactly 26,000 lbs manufacturer GVWR as a failure when strictly-below is required", () => {
    const result = classifyLead(
      baseLead({
        listedWeightLbs: 26000,
        listedWeightTerm: "gvwr",
      }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(result.reasons.find((r) => r.code === "gvwr")?.outcome).toBe("fail");
    expect(result.status).toBe("does_not_match");
  });

  it("treats missing / GVW-labeled weight as unknown — never confirmed match", () => {
    const missing = classifyLead(
      baseLead({
        listedWeightLbs: null,
        listedWeightTerm: "unknown",
        manufacturerGvwrLbs: null,
        gvwrDoorPlateVerified: false,
      }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(missing.reasons.find((r) => r.code === "gvwr")?.outcome).toBe("unknown");
    expect(missing.status).toBe("needs_verification");

    const gvwLead = baseLead({
      listedWeightLbs: 25999,
      listedWeightTerm: "gvw",
      manufacturerGvwrLbs: null,
      gvwrDoorPlateVerified: false,
    });
    expect(resolveManufacturerGvwrLbs(gvwLead).outcome).toBe("unknown");

    const gvwOnly = classifyLead(gvwLead, DEFAULT_BUYING_PROFILE, asOf);
    expect(gvwOnly.reasons.find((r) => r.code === "gvwr")?.outcome).toBe("unknown");
    expect(gvwOnly.reasons.find((r) => r.code === "gvwr")?.label).toMatch(/GVW/);
    expect(gvwOnly.status).toBe("needs_verification");
  });

  it("accepts door-plate verified manufacturer GVWR below 26,000", () => {
    const result = classifyLead(
      baseLead({
        listedWeightLbs: 25999,
        listedWeightTerm: "gvw",
        manufacturerGvwrLbs: 25500,
        gvwrDoorPlateVerified: true,
      }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(result.reasons.find((r) => r.code === "gvwr")?.outcome).toBe("pass");
    expect(result.status).toBe("confirmed_match");
  });
});

describe("mileage boundary", () => {
  it("accepts exactly 275,000 and rejects 275,001", () => {
    const atMax = classifyLead(baseLead({ mileage: 275000 }), DEFAULT_BUYING_PROFILE, asOf);
    expect(atMax.reasons.find((r) => r.code === "mileage")?.outcome).toBe("pass");
    expect(atMax.status).toBe("confirmed_match");

    const over = classifyLead(baseLead({ mileage: 275001 }), DEFAULT_BUYING_PROFILE, asOf);
    expect(over.reasons.find((r) => r.code === "mileage")?.outcome).toBe("fail");
    expect(over.status).toBe("does_not_match");
  });
});

describe("required versus preferred", () => {
  it("does not hard-fail for missing liftgate or unknown distance", () => {
    const noLiftgate = classifyLead(
      baseLead({ hasLiftgate: false, drivingDistanceMiles: null }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(noLiftgate.status).toBe("confirmed_match");
    expect(noLiftgate.reasons.find((r) => r.code === "liftgate")?.outcome).toBe("preferred_fail");
    expect(noLiftgate.reasons.find((r) => r.code === "distance")?.outcome).toBe(
      "preferred_unknown"
    );
    expect(noLiftgate.reasons.find((r) => r.code === "distance")?.label).toMatch(/not invented/i);
  });

  it("marks known over-distance trucks as out-of-range opportunity when required specs pass", () => {
    const result = classifyLead(
      baseLead({ drivingDistanceMiles: 1392 }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(result.status).toBe("out_of_range_opportunity");
  });

  it("does not use out-of-range when a required spec is still unknown", () => {
    const result = classifyLead(
      baseLead({
        drivingDistanceMiles: 1392,
        listedWeightLbs: 25999,
        listedWeightTerm: "gvw",
        manufacturerGvwrLbs: null,
        gvwrDoorPlateVerified: false,
      }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(result.status).toBe("needs_verification");
    expect(result.status).not.toBe("out_of_range_opportunity");
  });

  it("keeps required failures as does_not_match even when distance is over preferred range", () => {
    const result = classifyLead(
      baseLead({
        drivingDistanceMiles: 1392,
        listedWeightLbs: 26000,
        listedWeightTerm: "gvwr",
      }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(result.status).toBe("does_not_match");
  });

  it("does not invent a confirmed match when a required field is unknown", () => {
    const result = classifyLead(
      baseLead({ engineIsCummins: null }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(result.status).toBe("needs_verification");
    expect(result.status).not.toBe("confirmed_match");
  });

  it("shows price without filtering when max price is unset", () => {
    const result = classifyLead(baseLead({ price: 999999 }), DEFAULT_BUYING_PROFILE, asOf);
    expect(result.reasons.find((r) => r.code === "price")?.outcome).toBe("info");
    expect(result.status).toBe("confirmed_match");
  });

  it("applies max price as required when the buying profile sets it", () => {
    const profile: BuyingProfile = { ...DEFAULT_BUYING_PROFILE, maxPrice: 40000 };
    const result = classifyLead(baseLead({ price: 45000 }), profile, asOf);
    expect(result.reasons.find((r) => r.code === "price")?.outcome).toBe("fail");
    expect(result.status).toBe("does_not_match");
  });

  it("rejects non-exact box lengths such as 26.5", () => {
    const result = classifyLead(baseLead({ boxLengthFt: 26.5 }), DEFAULT_BUYING_PROFILE, asOf);
    expect(result.reasons.find((r) => r.code === "box_length")?.outcome).toBe("fail");
    expect(result.status).toBe("does_not_match");
  });
});
