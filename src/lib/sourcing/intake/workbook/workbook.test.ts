import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { classifyLead } from "@/lib/sourcing/match";
import { DEFAULT_BUYING_PROFILE, type TruckLead } from "@/types/sourcing";
import {
  buildWorkbookPreview,
  detectWorkbookFormat,
  extractBoxLengthFt,
  isAutomaticTransmission,
  isCumminsEngine,
  isHoganWholesaleHeaders,
  isPenskePreauctionHeaders,
  parseLiftgate,
  parseOsLocation,
  parseMileage,
  parseWeightLbs,
  parseWorkbookBuffer,
  validateInspectionUrl,
  HOGAN_WHOLESALE_SCOPE,
  PENSKE_PREAUCTION_SCOPE,
} from "@/lib/sourcing/intake/workbook";
import { mapPenskePreauctionRow } from "@/lib/sourcing/intake/workbook/penske-preauction";
import { mapHoganWholesaleRow } from "@/lib/sourcing/intake/workbook/hogan-wholesale";
import { headerKey } from "@/lib/sourcing/intake/workbook/normalize";

const penskePath = resolve(__dirname, "../../../../../fixtures/sourcing/penske-preauction-sample.xls");
const penskeDay2Path = resolve(
  __dirname,
  "../../../../../fixtures/sourcing/penske-preauction-sample-day2.xls"
);
const hoganPath = resolve(__dirname, "../../../../../fixtures/sourcing/hogan-wholesale-sample.xlsx");
const unknownPath = resolve(
  __dirname,
  "../../../../../fixtures/sourcing/unknown-workbook-sample.xlsx"
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
    manufacturerGvwrLbs: 25500,
    gvwrDoorPlateVerified: false,
    mileage: 100000,
    hasLiftgate: true,
    liftgateNotes: "",
    price: 40000,
    location: "MO",
    drivingDistanceMiles: 100,
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
    specEvidence: { engine: "Cummins", transmission: "Allison", boxLength: "26", gvwr: "25500" },
    ...partial,
  };
}

describe("workbook normalize helpers", () => {
  it("normalizes 25.5k / 26k / 31k GVW strings", () => {
    expect(parseWeightLbs("25.5k")).toBe(25500);
    expect(parseWeightLbs("26k")).toBe(26000);
    expect(parseWeightLbs("31k")).toBe(31000);
    expect(parseWeightLbs("25,999")).toBe(25999);
    expect(parseWeightLbs("not a weight")).toBeNull();
  });

  it("parses comma-grouped mileage", () => {
    expect(parseMileage("136,242")).toBe(136242);
    expect(parseMileage("122,035")).toBe(122035);
  });

  it("normalizes Cummins and Allison", () => {
    expect(isCumminsEngine("CUMMINS ISB 6.7")).toBe(true);
    expect(isCumminsEngine("CUM")).toBe(true);
    expect(isAutomaticTransmission("Allison 2100 HS")).toBe(true);
    expect(isAutomaticTransmission("AUTO")).toBe(true);
    expect(isAutomaticTransmission("MANUAL")).toBe(false);
  });

  it("extracts 24/26/28 box lengths", () => {
    expect(extractBoxLengthFt("26FT SAD MEDIUM VAN")).toBe(26);
    expect(extractBoxLengthFt("24' box")).toBe(24);
    expect(extractBoxLengthFt("28")).toBe(28);
  });

  it("parses liftgate / ramp", () => {
    expect(parseLiftgate("").hasLiftgate).toBeNull();
    expect(parseLiftgate("2500").hasLiftgate).toBe(true);
    expect(parseLiftgate("RAMP").notes.toLowerCase()).toMatch(/ramp/);
    expect(parseLiftgate("No").hasLiftgate).toBe(false);
  });

  it("parses Hogan OS locations and flags Canada", () => {
    const kc = parseOsLocation("31 - Kansas City, MO");
    expect(kc.location).toBe("Kansas City, MO");
    expect(kc.looksCanadian).toBe(false);
    const on = parseOsLocation("99 - Toronto, ON");
    expect(on.looksCanadian).toBe(true);
  });
});

describe("GVWR boundaries (≤26000 / ≥26001)", () => {
  const base = {
    year: 2019,
    boxLengthFt: 26,
    engineIsCummins: true,
    transmissionIsAutomatic: true,
    listedWeightLbs: null as number | null,
    listedWeightTerm: "gvwr" as const,
    manufacturerGvwrLbs: null as number | null,
    gvwrDoorPlateVerified: false,
    mileage: 100000,
    hasLiftgate: true,
    drivingDistanceMiles: 500,
    price: 40000,
  };

  it("25,999 → accepted on GVWR", () => {
    const r = classifyLead({ ...base, manufacturerGvwrLbs: 25999 }, DEFAULT_BUYING_PROFILE);
    expect(r.reasons.find((x) => x.code === "gvwr")?.outcome).toBe("pass");
  });

  it("26,000 → accepted on GVWR", () => {
    const r = classifyLead({ ...base, manufacturerGvwrLbs: 26000 }, DEFAULT_BUYING_PROFILE);
    expect(r.reasons.find((x) => x.code === "gvwr")?.outcome).toBe("pass");
    expect(DEFAULT_BUYING_PROFILE.gvwrMustBeStrictlyBelow).toBe(false);
  });

  it("26,001 → rejected", () => {
    const r = classifyLead({ ...base, manufacturerGvwrLbs: 26001 }, DEFAULT_BUYING_PROFILE);
    expect(r.reasons.find((x) => x.code === "gvwr")?.outcome).toBe("fail");
    expect(r.status).toBe("does_not_match");
  });

  it("missing GVWR → Needs verification", () => {
    const r = classifyLead(
      { ...base, manufacturerGvwrLbs: null, listedWeightTerm: "unknown", listedWeightLbs: null },
      DEFAULT_BUYING_PROFILE
    );
    expect(r.reasons.find((x) => x.code === "gvwr")?.outcome).toBe("unknown");
    expect(r.status).toBe("needs_verification");
  });

  it("GVW-only without manufacturer value → Needs verification", () => {
    const r = classifyLead(
      {
        ...base,
        manufacturerGvwrLbs: null,
        listedWeightTerm: "gvw",
        listedWeightLbs: 25500,
      },
      DEFAULT_BUYING_PROFILE
    );
    expect(r.reasons.find((x) => x.code === "gvwr")?.outcome).toBe("unknown");
  });
});

describe("format detection", () => {
  it("detects Penske and Hogan header signatures", () => {
    expect(
      isPenskePreauctionHeaders([
        "VIN",
        "Unit",
        "Year",
        "Make",
        "Description",
        "Miles",
        "GVW",
        "Engine Make",
        "City",
        "State",
      ])
    ).toBe(true);
    expect(
      isHoganWholesaleHeaders([
        "Product Name",
        "Unit #",
        "Wholesale Price",
        "Miles / Hrs.",
        "GVW",
        "Length",
        "OS Location",
        "3rd Party Insp",
      ])
    ).toBe(true);
  });

  it("headerKey normalizes Miles / Hrs.", () => {
    expect(headerKey("Miles / Hrs.")).toBe("miles_hrs");
    expect(headerKey("Unit #")).toBe("unit");
    expect(headerKey("3rd Party Insp")).toBe("3rd_party_insp");
  });
});

describe("Penske .xls fixture", () => {
  it("parses Medium Duty only and maps FTL/CUM/AUTO/box/body", () => {
    const buf = readFileSync(penskePath);
    const parsed = parseWorkbookBuffer(buf, "Pre-Auction-For-Sale-List-9.21.26.xls");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.detected.format).toBe("penske-preauction");
    expect(parsed.detected.sheetName).toMatch(/medium duty/i);
    expect(parsed.active.rows.length).toBeGreaterThanOrEqual(5);

    const mapped = mapPenskePreauctionRow(parsed.active.rows[0]);
    expect(mapped?.makeModel).toMatch(/Freightliner/i);
    expect(mapped?.engineIsCummins).toBe(true);
    expect(mapped?.transmissionIsAutomatic).toBe(true);
    expect(mapped?.boxLengthFt).toBe(26);
    expect(mapped?.sourceScope).toBe(PENSKE_PREAUCTION_SCOPE);
    expect(mapped?.gvwLbs).toBe(25999);

    const reefer = mapPenskePreauctionRow(
      parsed.active.rows.find((r) => /reefer/i.test(JSON.stringify(r)))!
    );
    expect(reefer?.bodyRejectReason).toMatch(/reefer/i);
  });

  it("missing listing URL does not reject rows with Unit/VIN", () => {
    const buf = readFileSync(penskePath);
    const preview = buildWorkbookPreview(buf, "penske.xls", [], DEFAULT_BUYING_PROFILE);
    const ok = preview.plans.filter((p) => p.input.sourceListingId);
    expect(ok.length).toBeGreaterThan(0);
    expect(ok.every((p) => p.input.sourceUrl === "")).toBe(true);
    expect(preview.skippedInvalid).toBeGreaterThanOrEqual(0);
  });
});

describe("Hogan .xlsx fixture", () => {
  it("parses unit 192018 fields and inspection HTTPS host", () => {
    const buf = readFileSync(hoganPath);
    const parsed = parseWorkbookBuffer(buf, "Wholesale List 9.21.26.xlsx");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.detected.format).toBe("hogan-wholesale");

    const row = parsed.active.rows.find((r) => (r.unit || r["unit"]) === "192018")!;
    const mapped = mapHoganWholesaleRow(row);
    expect(mapped?.year).toBe(2019);
    expect(mapped?.makeModel).toMatch(/Freightliner M2 106/i);
    expect(mapped?.mileage).toBe(136242);
    expect(mapped?.engineIsCummins).toBe(true);
    expect(mapped?.transmissionIsAutomatic).toBe(true);
    expect(mapped?.boxLengthFt).toBe(26);
    expect(mapped?.gvwLbs).toBe(25500);
    expect(mapped?.hasLiftgate).toBe(true);
    expect(mapped?.liftgateNotes).toMatch(/2,?500/i);
    expect(mapped?.location).toBe("Kansas City, MO");
    expect(mapped?.price).toBe(42000);
    expect(mapped?.completionStatus).toMatch(/Not Started/i);
    expect(mapped?.sourceScope).toBe(HOGAN_WHOLESALE_SCOPE);
    expect(mapped?.inspectionUrl).toMatch(/^https:\/\/inspection-reports\.example\.test\//);
  });

  it("validates inspection hosts", () => {
    expect(validateInspectionUrl("http://inspection-reports.example.test/x").ok).toBe(false);
    expect(validateInspectionUrl("https://evil.example/x").ok).toBe(false);
    expect(validateInspectionUrl("https://inspection-reports.example.test/x").ok).toBe(true);
    expect(validateInspectionUrl("https://reports.nationalinspect.com/report/x").ok).toBe(true);
  });
});

describe("workbook preview / dedupe / change detection", () => {
  it("rejects unknown workbooks", () => {
    const buf = readFileSync(unknownPath);
    const parsed = parseWorkbookBuffer(buf, "random.xlsx");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("unrecognized");
  });

  it("rejects oversized buffers", () => {
    const huge = Buffer.alloc(9 * 1024 * 1024, 1);
    const parsed = parseWorkbookBuffer(huge, "big.xlsx");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("too_large");
  });

  it("repeat import is seen-again; price change is listing-change", () => {
    const day1 = readFileSync(penskePath);
    const first = buildWorkbookPreview(day1, "day1.xls", [], DEFAULT_BUYING_PROFILE, {
      now: new Date("2026-09-21T12:00:00Z"),
    });
    expect(first.inserted).toBeGreaterThan(0);

    const existing: TruckLead[] = first.plans.map((p, i) =>
      asLead({
        id: `e${i}`,
        ...p.input,
        listingFirstSeenAt: p.listingFirstSeenAt,
        listingLastSeenAt: p.listingLastSeenAt,
        listingLastChangedAt: p.listingLastChangedAt,
      })
    );

    const again = buildWorkbookPreview(day1, "day1.xls", existing, DEFAULT_BUYING_PROFILE, {
      now: new Date("2026-09-22T12:00:00Z"),
    });
    expect(again.seenAgain).toBeGreaterThan(0);
    expect(again.inserted).toBe(0);

    const day2 = readFileSync(penskeDay2Path);
    const changed = buildWorkbookPreview(day2, "day2.xls", existing, DEFAULT_BUYING_PROFILE, {
      now: new Date("2026-09-23T12:00:00Z"),
    });
    expect(changed.listingChanges).toBeGreaterThanOrEqual(1);
  });

  it("does not call OpenAI or Tavily during parse/preview", () => {
    const openAi = vi.fn();
    const tavily = vi.fn();
    (globalThis as { __openai?: unknown }).__openai = openAi;
    (globalThis as { __tavily?: unknown }).__tavily = tavily;
    const buf = readFileSync(hoganPath);
    buildWorkbookPreview(buf, "hogan.xlsx", [], DEFAULT_BUYING_PROFILE);
    expect(openAi).not.toHaveBeenCalled();
    expect(tavily).not.toHaveBeenCalled();
  });
});

describe("detectWorkbookFormat helper", () => {
  it("returns error for empty headers", () => {
    const result = detectWorkbookFormat({
      filename: "x.xlsx",
      sheetNames: ["A"],
      headersBySheet: { A: ["Nope", "Nothing"] },
    });
    expect("error" in result).toBe(true);
  });
});
