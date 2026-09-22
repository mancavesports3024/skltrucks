import { describe, expect, it } from "vitest";
import { classifyLead, type LeadMatchInput } from "@/lib/sourcing/match";
import {
  applyDeterministicEngineIsCummins,
  inferEngineIsCumminsFromText,
} from "@/lib/sourcing/search/deterministic-specs";
import { candidateToTruckLeadInput } from "@/lib/sourcing/search/map-candidates";
import { mapRawTruck } from "@/lib/sourcing/search/openai-normalize";
import type { ExtractedTruckCandidate } from "@/lib/sourcing/search/types";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

const asOf = new Date("2026-09-19T12:00:00Z");

function baseLead(over: Partial<LeadMatchInput> = {}): LeadMatchInput {
  return {
    year: 2019,
    boxLengthFt: 24,
    engineIsCummins: true,
    transmissionIsAutomatic: true,
    listedWeightLbs: 25999,
    listedWeightTerm: "gvwr",
    manufacturerGvwrLbs: null,
    gvwrDoorPlateVerified: false,
    mileage: 100000,
    hasLiftgate: true,
    drivingDistanceMiles: 800,
    price: 32000,
    ...over,
  };
}

function stapletonLikeCandidate(
  over: Partial<ExtractedTruckCandidate> = {}
): ExtractedTruckCandidate {
  return {
    listingUrl: "https://www.stapletonmotors.com/inventory/2019-kenworth-t270-/917966",
    sourceName: "Stapleton Motors",
    seller: "Stapleton Motors",
    stockNumber: "917966",
    vin: "",
    year: 2019,
    makeModel: "Kenworth T270",
    engine: "PACCAR PX-7",
    engineIsCummins: null, // OpenAI left this null — must not override deterministic reject
    engineEvidence: "Engine: PACCAR PX-7",
    transmission: "Allison Automatic",
    transmissionIsAutomatic: true,
    transmissionEvidence: "Allison Automatic",
    boxLengthFt: 24,
    boxLengthEvidence: "24' BOX!",
    manufacturerGvwrLbs: 26000,
    listedWeightLbs: null,
    listedWeightTerm: "gvwr",
    gvwrEvidence: "26,000LB GVWR!",
    mileage: null,
    hasLiftgate: true,
    askingPrice: 32599,
    auctionCurrentBid: null,
    location: "Commerce City, CO",
    drivingDistanceMiles: 1200,
    distanceIsEstimate: true,
    phone: "(303) 261-9000",
    contactName: "",
    contactRole: "",
    evidenceUrl: "https://www.stapletonmotors.com/inventory/2019-kenworth-t270-/917966",
    notes: "",
    ...over,
  };
}

describe("deterministic engine inference", () => {
  it("rejects Paccar / known non-Cummins engines even when OpenAI claim is null", () => {
    expect(inferEngineIsCumminsFromText("PACCAR PX-7", null)).toBe(false);
    expect(
      applyDeterministicEngineIsCummins({
        engine: "PACCAR PX-7",
        engineEvidence: "Engine: PACCAR PX-7",
        engineIsCummins: null,
      })
    ).toBe(false);
    // OpenAI cannot override with true
    expect(
      applyDeterministicEngineIsCummins({
        engine: "PACCAR PX-7",
        engineEvidence: "Engine: PACCAR PX-7",
        engineIsCummins: true,
      })
    ).toBe(false);
  });

  it("Paccar engine → Rejected (does_not_match)", () => {
    const result = classifyLead(
      baseLead({ engineIsCummins: false }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(result.reasons.find((r) => r.code === "cummins")?.outcome).toBe("fail");
    expect(result.status).toBe("does_not_match");
  });

  it("mapRawTruck + candidate mapping reject Stapleton-style Paccar listing", () => {
    const raw = mapRawTruck({
      listingUrl: stapletonLikeCandidate().listingUrl,
      engine: "PACCAR PX-7",
      engineEvidence: "Engine: PACCAR PX-7",
      engineIsCummins: null,
      manufacturerGvwrLbs: 26000,
      listedWeightTerm: "GVWR",
      gvwrEvidence: "26,000LB GVWR!",
      transmission: "Allison Automatic",
      transmissionIsAutomatic: true,
      transmissionEvidence: "Allison Automatic",
      boxLengthFt: 24,
      boxLengthEvidence: "24' BOX!",
      year: 2019,
      seller: "Stapleton Motors",
      stockNumber: "917966",
    });
    expect(raw.engineIsCummins).toBe(false);
    expect(raw.listedWeightTerm).toBe("gvwr");
    expect(raw.listedWeightLbs).toBe(26000);

    const mapped = candidateToTruckLeadInput(raw);
    expect(mapped.rejectReason).toBeUndefined();
    expect(mapped.input.engineIsCummins).toBe(false);
    const match = classifyLead(mapped.input, DEFAULT_BUYING_PROFILE, asOf);
    expect(match.status).toBe("does_not_match");
    expect(match.reasons.find((r) => r.code === "cummins")?.outcome).toBe("fail");
    expect(match.reasons.find((r) => r.code === "gvwr")?.outcome).toBe("pass");
  });
});

describe("deterministic GVWR rules", () => {
  it("GVWR 26,000 → accepted when profile allows ≤ 26,000", () => {
    const result = classifyLead(
      baseLead({
        listedWeightLbs: 26000,
        listedWeightTerm: "gvwr",
        manufacturerGvwrLbs: 26000,
      }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(result.reasons.find((r) => r.code === "gvwr")?.outcome).toBe("pass");
    expect(result.status).toBe("confirmed_match");
  });

  it("manufacturerGvwrLbs 26001 rejects", () => {
    const result = classifyLead(
      baseLead({
        listedWeightLbs: null,
        listedWeightTerm: "gvwr",
        manufacturerGvwrLbs: 26001,
        gvwrDoorPlateVerified: false,
      }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(result.reasons.find((r) => r.code === "gvwr")?.outcome).toBe("fail");
    expect(result.status).toBe("does_not_match");
  });

  it("GVWR 25,999 → eligible (gvwr constraint passes)", () => {
    const result = classifyLead(
      baseLead({
        listedWeightLbs: 25999,
        listedWeightTerm: "gvwr",
        manufacturerGvwrLbs: 25999,
      }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(result.reasons.find((r) => r.code === "gvwr")?.outcome).toBe("pass");
    expect(result.status).not.toBe("does_not_match");
    expect(result.status).toBe("confirmed_match");
  });

  it("missing engine or GVWR → Needs verification", () => {
    const missingEngine = classifyLead(
      baseLead({ engineIsCummins: null }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(missingEngine.status).toBe("needs_verification");
    expect(missingEngine.reasons.find((r) => r.code === "cummins")?.outcome).toBe("unknown");

    const missingGvwr = classifyLead(
      baseLead({
        listedWeightLbs: null,
        listedWeightTerm: "unknown",
        manufacturerGvwrLbs: null,
        gvwrDoorPlateVerified: false,
      }),
      DEFAULT_BUYING_PROFILE,
      asOf
    );
    expect(missingGvwr.status).toBe("needs_verification");
    expect(missingGvwr.reasons.find((r) => r.code === "gvwr")?.outcome).toBe("unknown");
  });
});
