import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { applyEvidenceGate, parseCsv, csvRowToIntakeLead } from "@/lib/sourcing/intake/csv";
import {
  buildIntakeBatchFromCsv,
  buildIntakeBatchFromSpreadsheet,
} from "@/lib/sourcing/intake/import";
import {
  buildPenskeUnitListingUrl,
  isPenskeExportRow,
  normalizePenskeExportRow,
} from "@/lib/sourcing/intake/penske-export";
import { parseSpreadsheetBuffer } from "@/lib/sourcing/intake/spreadsheet";
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
const penskeCsv = readFileSync(
  resolve(__dirname, "../../../../fixtures/sourcing/penske-export-sample.csv"),
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

describe("Penske Used Trucks export intake (no hand-edit)", () => {
  it("detects and normalizes Unit / Eng / GVW columns", () => {
    const parsed = parseCsv(penskeCsv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(isPenskeExportRow(parsed.rows[0])).toBe(true);
    const normalized = normalizePenskeExportRow(parsed.rows[0]);
    expect(normalized.stock_number).toBe("592841");
    expect(normalized.source_scope).toBe("penske-used-trucks");
    expect(normalized.seller).toBe("Penske Used Trucks");
    expect(normalized.listing_url).toBe(buildPenskeUnitListingUrl("592841"));
    expect(normalized.engine).toMatch(/Cummins/);
    expect(normalized.engine_is_cummins).toBe("true");
    expect(normalized.transmission_is_automatic).toBe("true");
    expect(normalized.manufacturer_gvwr_lbs).toBe("25999");
  });

  it("imports raw Penske CSV without stock_number or listing_url columns", () => {
    const batch = buildIntakeBatchFromCsv(penskeCsv, [], DEFAULT_BUYING_PROFILE, {
      sourceLabel: "Penske Used Trucks export",
    });
    expect(batch.parseError).toBeUndefined();
    expect(batch.skippedInvalid).toBe(0);
    expect(batch.usableLeads).toBe(2);
    expect(batch.inserted).toBe(2);

    const first = batch.plans[0].input;
    expect(first.stockNumber).toBe("592841");
    expect(first.sourceListingId).toBe("592841");
    expect(first.sourceScope).toBe("penske-used-trucks");
    expect(first.sourceUrl).toContain("unit=592841");
    expect(first.sourceUrl).toContain("/vehicle/592841");
    expect(first.canonicalListingUrl).toContain("unit=592841");
    // Hash-only URLs would collide after canonicalize — query keeps each unit unique
    expect(first.canonicalListingUrl).not.toBe(
      batch.plans[1].input.canonicalListingUrl
    );
    expect(first.engineIsCummins).toBe(true);
    expect(first.transmissionIsAutomatic).toBe(true);
    expect(first.price).toBe(42900);
    expect(first.mileage).toBe(142000);
    // Box length absent on Penske export → needs verification
    expect(first.boxLengthFt).toBeNull();
    expect(first.researchUncertaintyLabels).toContain("missing_box_length_evidence");

    const second = batch.plans[1].input;
    expect(second.engineIsCummins).toBe(false);
    expect(second.transmissionIsAutomatic).toBe(false);
  });

  it("parses the same Penske rows from an .xlsx buffer", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "Unit",
        "Year",
        "Make",
        "Model",
        "Eng Mfr",
        "Eng Model",
        "Horse Power",
        "Trans Type",
        "Trans Make",
        "Trans Model",
        "GVW (lbs)",
        "LTD Miles",
        "Sale Price",
        "Liftgate",
        "State",
        "Area Name",
        "Vin#",
      ],
      [
        "700001",
        "2020",
        "International",
        "4300",
        "Cummins",
        "ISB",
        "250",
        "Automatic",
        "Allison",
        "",
        "25500",
        "99000",
        "45500",
        "Yes",
        "FL",
        "Orlando",
        "1HTMMAAL0KH123456",
      ],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Inventory");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const parsed = parseSpreadsheetBuffer(buffer, "penske-used-trucks.xlsx");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(1);
    expect(isPenskeExportRow(parsed.rows[0])).toBe(true);

    const batch = buildIntakeBatchFromSpreadsheet(buffer, [], DEFAULT_BUYING_PROFILE, {
      sourceLabel: "Penske Excel download",
      filename: "penske-used-trucks.xlsx",
    });
    expect(batch.parseError).toBeUndefined();
    expect(batch.usableLeads).toBe(1);
    expect(batch.skippedInvalid).toBe(0);
    expect(batch.plans[0].input.stockNumber).toBe("700001");
    expect(batch.plans[0].input.sourceUrl).toContain("unit=700001");
    expect(batch.plans[0].input.sourceUrl).toContain("/vehicle/700001");
    expect(batch.plans[0].input.engineIsCummins).toBe(true);
  });

  it("parses Penske CSV via spreadsheet helper", () => {
    const buffer = Buffer.from(penskeCsv, "utf8");
    const batch = buildIntakeBatchFromSpreadsheet(buffer, [], DEFAULT_BUYING_PROFILE, {
      filename: "penske-export.csv",
      sourceLabel: "Penske CSV as spreadsheet",
    });
    expect(batch.usableLeads).toBe(2);
    expect(batch.skippedInvalid).toBe(0);
  });
});
