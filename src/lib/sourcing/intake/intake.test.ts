import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyEvidenceGate, parseCsv, csvRowToIntakeLead } from "@/lib/sourcing/intake/csv";
import { buildIntakeBatchFromCsv } from "@/lib/sourcing/intake/import";
import { selectDigestLeadEvents } from "@/lib/sourcing/listing-content";
import { DEFAULT_BUYING_PROFILE, type TruckLead } from "@/types/sourcing";

const day1 = readFileSync(
  resolve(__dirname, "../../../../fixtures/sourcing/intake-sample-day1.csv"),
  "utf8"
);
const day2 = readFileSync(
  resolve(__dirname, "../../../../fixtures/sourcing/intake-sample-day2.csv"),
  "utf8"
);

function asLead(partial: Partial<TruckLead> & Pick<TruckLead, "id">): TruckLead {
  return {
    seller: "Test",
    supplierContactId: null,
    sourceUrl: "",
    sourceScope: "test",
    sourceListingId: "",
    canonicalListingUrl: "",
    stockNumber: "",
    vin: "",
    year: 2019,
    makeModel: "Freightliner M2",
    boxLengthFt: 26,
    boxLengthRaw: "26'",
    engine: "Cummins",
    engineIsCummins: true,
    transmission: "Allison",
    transmissionIsAutomatic: true,
    listedWeightLbs: null,
    listedWeightTerm: "unknown",
    manufacturerGvwrLbs: null,
    gvwrDoorPlateVerified: false,
    mileage: 100000,
    hasLiftgate: true,
    liftgateNotes: "",
    price: 40000,
    location: "FL",
    drivingDistanceMiles: 1000,
    distanceIsEstimate: true,
    dateLastChecked: null,
    verificationNotes: "",
    workflowStatus: "new",
    sklCallNotes: "",
    researchUncertaintyLabels: [],
    isSeedResearch: false,
    seedSource: "",
    matchStatus: "needs_verification",
    matchReasons: [],
    specEvidence: { engine: "", transmission: "", boxLength: "", gvwr: "" },
    ...partial,
  };
}

describe("CSV intake parser", () => {
  it("parses sample day1 rows", () => {
    const parsed = parseCsv(day1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(3);
  });

  it("fails on empty / null source", () => {
    expect(parseCsv("").ok).toBe(false);
    const batch = buildIntakeBatchFromCsv(null, [], DEFAULT_BUYING_PROFILE);
    expect(batch.parseError?.code).toBe("source_failure");
    expect(batch.usableLeads).toBe(0);
  });

  it("gates specs without evidence into unknown + needs verification labels", () => {
    const gated = applyEvidenceGate({
      engineIsCummins: true,
      transmissionIsAutomatic: true,
      boxLengthFt: 26,
      manufacturerGvwrLbs: 25500,
      listedWeightLbs: 25500,
      listedWeightTerm: "gvwr",
      gvwrDoorPlateVerified: true,
      evidence: { engine: "", transmission: "", boxLength: "", gvwr: "" },
    });
    expect(gated.engineIsCummins).toBeNull();
    expect(gated.transmissionIsAutomatic).toBeNull();
    expect(gated.boxLengthFt).toBeNull();
    expect(gated.manufacturerGvwrLbs).toBeNull();
    expect(gated.missingEvidence).toEqual(
      expect.arrayContaining(["engine", "transmission", "box_length", "gvwr"])
    );
  });
});

describe("intake batch + digest kinds", () => {
  it("imports day1 then day2: new, change, seen-again; missing specs need verification", () => {
    const now = new Date("2026-09-19T18:00:00Z");
    const first = buildIntakeBatchFromCsv(day1, [], DEFAULT_BUYING_PROFILE, {
      sourceLabel: "Penske weekly email → CSV",
      defaultSourceScope: "penske-used-trucks",
      now: new Date("2026-09-18T18:00:00Z"),
    });

    expect(first.parseError).toBeUndefined();
    expect(first.usableLeads).toBe(3);
    expect(first.inserted).toBe(3);
    expect(first.needsVerification).toBeGreaterThanOrEqual(1);
    expect(first.staffMustVerify.length).toBeGreaterThan(0);

    const existing: TruckLead[] = first.plans.map((plan, i) =>
      asLead({
        id: `e${i}`,
        ...plan.input,
        matchStatus: plan.matchStatus,
        listingFirstSeenAt: plan.listingFirstSeenAt,
        listingLastChangedAt: plan.listingLastChangedAt,
        listingLastSeenAt: plan.listingLastSeenAt,
      })
    );

    const second = buildIntakeBatchFromCsv(day2, existing, DEFAULT_BUYING_PROFILE, {
      sourceLabel: "Penske weekly email → CSV",
      now,
    });

    expect(second.inserted).toBe(0);
    expect(second.listingChanges).toBe(1); // PU-1001 price drop
    expect(second.seenAgain).toBe(2);

    const afterSecond: TruckLead[] = second.plans.map((plan) => {
      const prior = existing.find(
        (l) =>
          l.vin === plan.input.vin ||
          (l.sourceScope === plan.input.sourceScope &&
            l.sourceListingId === plan.input.sourceListingId)
      )!;
      return asLead({
        id: prior.id,
        ...plan.input,
        matchStatus: plan.matchStatus,
        listingFirstSeenAt: plan.listingFirstSeenAt,
        listingLastChangedAt: plan.listingLastChangedAt,
        listingLastSeenAt: plan.listingLastSeenAt,
      });
    });

    const events = selectDigestLeadEvents(
      afterSecond,
      new Date("2026-09-18T18:00:00Z"),
      now
    );
    const kinds = events.map((e) => e.kind).sort();
    expect(kinds).toContain("listing_change");
    expect(kinds).toContain("seen_again");
    // first_seen was day1 (outside or at edge) — new listings from day1 may still be in 24h window
  });

  it("maps a row with listing URL and stock", () => {
    const parsed = parseCsv(day1);
    if (!parsed.ok) throw new Error("parse failed");
    const lead = csvRowToIntakeLead(parsed.rows[0]);
    expect(lead.rowErrors).toHaveLength(0);
    expect(lead.input.sourceUrl).toContain("penskeusedtrucks.com");
    expect(lead.input.stockNumber).toBe("PU-1001");
    expect(lead.input.specEvidence.engine).toMatch(/Cummins/);
  });
});
