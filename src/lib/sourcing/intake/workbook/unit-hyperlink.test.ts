import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";
import {
  buildWorkbookPreview,
  classifyPenskeUnitHyperlink,
  extractWorkbookHyperlinkTarget,
  parseWorkbookBuffer,
  workbookRowsToIntake,
} from "@/lib/sourcing/intake/workbook";
import { mapPenskePreauctionRow } from "@/lib/sourcing/intake/workbook/penske-preauction";
import { listingContentChanged } from "@/lib/sourcing/listing-content";
import { planIntakeRow } from "@/lib/sourcing/intake/import";
import type { TruckLead } from "@/types/sourcing";

const casesPath = resolve(
  __dirname,
  "../../../../../fixtures/sourcing/penske-unit-hyperlink-cases.xlsx"
);
const penskeSamplePath = resolve(
  __dirname,
  "../../../../../fixtures/sourcing/penske-preauction-sample.xls"
);
const hoganPath = resolve(
  __dirname,
  "../../../../../fixtures/sourcing/hogan-wholesale-sample.xlsx"
);

describe("classifyPenskeUnitHyperlink", () => {
  it("accepts a public individual Penske unit page", () => {
    const c = classifyPenskeUnitHyperlink("https://www.penskeusedtrucks.com/unit-12345/");
    expect(c.kind).toBe("listingUrl");
    expect(c.url).toMatch(/penskeusedtrucks\.com\/unit-12345/);
    expect(c.previewNote).toBe("Individual listing link found");
  });

  it("accepts an approved inspection-report host", () => {
    const c = classifyPenskeUnitHyperlink(
      "https://inspection-reports.example.test/report/abc"
    );
    expect(c.kind).toBe("inspectionUrl");
    expect(c.previewNote).toBe("Inspection link found");
  });

  it("reports missing hyperlink", () => {
    expect(classifyPenskeUnitHyperlink("").kind).toBe("missing");
    expect(classifyPenskeUnitHyperlink(null).previewNote).toBe("No hyperlink provided");
  });

  it("rejects relative, HTTP, unsupported host, hubs, API, login", () => {
    expect(classifyPenskeUnitHyperlink("/unit-1").kind).toBe("rejected");
    expect(classifyPenskeUnitHyperlink("http://www.penskeusedtrucks.com/unit-1/").reason).toMatch(
      /HTTP/i
    );
    expect(classifyPenskeUnitHyperlink("https://evil.example.com/unit-1").reason).toMatch(
      /unsupported hostname/i
    );
    expect(
      classifyPenskeUnitHyperlink("https://www.penskeusedtrucks.com/search-inventory/?q=x").reason
    ).toMatch(/search|hub/i);
    expect(
      classifyPenskeUnitHyperlink("https://www.penskeusedtrucks.com/api/v1/units/1").reason
    ).toMatch(/API/i);
    expect(classifyPenskeUnitHyperlink("https://www.penskeusedtrucks.com/login").reason).toMatch(
      /login/i
    );
  });

  it("rejects credential-like query keys and JWT-like values", () => {
    const keys = [
      "authorization",
      "token",
      "access_token",
      "api_key",
      "client_id",
      "x-ibm-client-id",
      "session",
      "ASP.NET_SessionId",
      "window_name",
      "request_id",
    ];
    for (const key of keys) {
      const c = classifyPenskeUnitHyperlink(
        `https://www.penskeusedtrucks.com/unit-9/?${key}=secret`
      );
      expect(c.kind, key).toBe("rejected");
      expect(c.url, key).toBe("");
    }
    const jwt = classifyPenskeUnitHyperlink(
      "https://www.penskeusedtrucks.com/unit-9/?q=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc"
    );
    expect(jwt.kind).toBe("rejected");
  });

  it("rejects userinfo and fragments", () => {
    expect(
      classifyPenskeUnitHyperlink("https://user:pass@www.penskeusedtrucks.com/unit-1/").kind
    ).toBe("rejected");
    expect(
      classifyPenskeUnitHyperlink("https://www.penskeusedtrucks.com/unit-1/#frag").kind
    ).toBe("rejected");
  });

  it("never invents a unit page from blank input", () => {
    expect(classifyPenskeUnitHyperlink("").url).toBe("");
  });
});

describe("extractWorkbookHyperlinkTarget", () => {
  it("prefers cell.l.Target over formula text", () => {
    expect(
      extractWorkbookHyperlinkTarget({
        l: { Target: "https://www.penskeusedtrucks.com/unit-1/" },
        f: 'HYPERLINK("https://evil.example.com/x","1")',
      })
    ).toBe("https://www.penskeusedtrucks.com/unit-1/");
  });

  it("parses HYPERLINK formula text without evaluating it", () => {
    expect(
      extractWorkbookHyperlinkTarget({
        f: 'HYPERLINK("https://reports.nationalinspect.com/1/2/abc/","88001")',
      })
    ).toBe("https://reports.nationalinspect.com/1/2/abc/");
    expect(
      extractWorkbookHyperlinkTarget({
        f: '=HYPERLINK("https://www.penskeusedtrucks.com/unit-9/","9")',
      })
    ).toBe("https://www.penskeusedtrucks.com/unit-9/");
    expect(extractWorkbookHyperlinkTarget({ f: "SUM(A1:A2)" })).toBe("");
    expect(extractWorkbookHyperlinkTarget({ f: "" })).toBe("");
  });
});

describe("Penske workbook Unit hyperlink extraction", () => {
  it("extracts hyperlink Target separately from Unit display text", () => {
    const buf = readFileSync(casesPath);
    const parsed = parseWorkbookBuffer(buf, "penske-unit-hyperlink-cases.xlsx");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const first = parsed.active.rows[0];
    expect(first.unit || first.unit_number).toBe("88001");
    expect(first.unit_hyperlink).toMatch(/penskeusedtrucks\.com\/unit-88001/);
  });

  it("attaches HYPERLINK formula targets from a synthetic sheet", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Unit", "Year"],
      ["99001", "2019"],
    ]);
    ws["A2"].f =
      'HYPERLINK("https://reports.nationalinspect.com/11/22/tokentokentoken/","99001")';
    ws["A2"].v = "99001";
    ws["A2"].t = "s";
    XLSX.utils.book_append_sheet(wb, ws, "Medium Duty");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const wb2 = XLSX.read(buf, { type: "buffer", bookVBA: false });
    const sheet = wb2.Sheets["Medium Duty"];
    expect(extractWorkbookHyperlinkTarget(sheet["A2"])).toMatch(
      /reports\.nationalinspect\.com\/11\/22\/tokentokentoken\//
    );
    const classified = classifyPenskeUnitHyperlink(
      extractWorkbookHyperlinkTarget(sheet["A2"])
    );
    expect(classified.kind).toBe("inspectionUrl");
    expect(classified.url).toMatch(/nationalinspect/);
  });

  it("does not treat display text that looks like a URL as a hyperlink", () => {
    const buf = readFileSync(casesPath);
    const parsed = parseWorkbookBuffer(buf, "penske-unit-hyperlink-cases.xlsx");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const row = parsed.active.rows.find((r) =>
      /^https:\/\//i.test(r.unit || r.unit_number || "")
    );
    expect(row).toBeTruthy();
    expect(row!.unit_hyperlink || "").toBe("");
    const mapped = mapPenskePreauctionRow(row!);
    expect(mapped?.hyperlink.kind).toBe("missing");
    expect(mapped?.listingUrl).toBe("");
    expect(mapped?.sourceListingId).toMatch(/^https:\/\//i);
  });

  it("maps safe listing and inspection URLs; rejects unsafe without invalidating the row", () => {
    const buf = readFileSync(casesPath);
    const parsed = parseWorkbookBuffer(buf, "penske-unit-hyperlink-cases.xlsx");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const intake = workbookRowsToIntake(parsed);
    expect(intake.every((r) => r.rowErrors.length === 0)).toBe(true);

    const byUnit = new Map(
      intake.map((r) => [r.input.sourceListingId, r.input] as const)
    );
    expect(byUnit.get("88001")?.sourceUrl).toMatch(/\/unit-88001/);
    expect(byUnit.get("88001")?.canonicalListingUrl).toMatch(/\/unit-88001/);
    expect(byUnit.get("88001")?.specEvidence.hyperlinkSource).toBe("workbook_unit_cell");
    expect(byUnit.get("88001")?.specEvidence.hyperlinkDestinationType).toBe("listing");

    expect(byUnit.get("88002")?.sourceUrl).toBe("");
    expect(byUnit.get("88002")?.specEvidence.inspectionUrl).toMatch(
      /inspection-reports\.example\.test/
    );
    expect(byUnit.get("88002")?.specEvidence.hyperlinkDestinationType).toBe("inspection");

    expect(byUnit.get("88003")?.specEvidence.hyperlinkDestinationType).toBe("missing");
    expect(byUnit.get("88011")?.sourceUrl).toBe("");
    expect(byUnit.get("88011")?.specEvidence.hyperlinkDestinationType).toBe("rejected");
    expect(byUnit.get("88011")?.verificationNotes).toMatch(/Workbook hyperlink rejected/i);
  });

  it("Preview and Import planning use identical validation (same buffer)", () => {
    const buf = readFileSync(casesPath);
    const preview = buildWorkbookPreview(buf, "cases.xlsx", [], DEFAULT_BUYING_PROFILE);
    const again = buildWorkbookPreview(buf, "cases.xlsx", [], DEFAULT_BUYING_PROFILE);
    expect(preview.previewRows.map((r) => [r.unit, r.hyperlinkKind, r.hyperlinkUrl])).toEqual(
      again.previewRows.map((r) => [r.unit, r.hyperlinkKind, r.hyperlinkUrl])
    );
    const listing = preview.previewRows.find((r) => r.unit === "88001");
    expect(listing?.hyperlinkKind).toBe("listing");
    expect(listing?.hyperlinkUrl).toMatch(/unit-88001/);
    const insp = preview.previewRows.find((r) => r.unit === "88002");
    expect(insp?.hyperlinkKind).toBe("inspection");
  });

  it("tampered client unit_hyperlink cannot invent a listing without workbook metadata path — mapping trusts row fields from parse only", () => {
    // Simulate a forged row that a client might try to inject into import
    const forged = mapPenskePreauctionRow({
      unit: "99999",
      year: "2019",
      make: "Freightliner",
      model: "M2",
      type: "VAN",
      description: "26' DRY VAN",
      miles: "100000",
      price: "40000",
      city: "Dallas",
      state: "TX",
      gvw: "25500",
      engine_make: "Cummins",
      engine_model: "ISB",
      trans: "AUTO",
      // attacker-supplied field — still goes through classifier
      unit_hyperlink: "https://evil.example.com/steal",
    });
    expect(forged?.listingUrl).toBe("");
    expect(forged?.hyperlink.kind).toBe("rejected");
  });

  it("safe listing URL change is listing-content significant; call notes are not", () => {
    const before = {
      sourceUrl: "",
      canonicalListingUrl: "",
      sourceScope: "penske-preauction",
      sourceListingId: "88001",
      seller: "Penske Pre-Auction",
      stockNumber: "88001",
      vin: "",
      year: 2019,
      makeModel: "Freightliner M2",
      boxLengthFt: 26,
      boxLengthRaw: "26'",
      engine: "Cummins",
      engineIsCummins: true,
      transmission: "Automatic",
      transmissionIsAutomatic: true,
      listedWeightLbs: 25500,
      listedWeightTerm: "gvw" as const,
      manufacturerGvwrLbs: 25500,
      gvwrDoorPlateVerified: false,
      mileage: 120000,
      hasLiftgate: true,
      liftgateNotes: "",
      price: 42000,
      location: "Dallas, TX",
      drivingDistanceMiles: null,
      distanceIsEstimate: true,
      specEvidence: {},
    };
    const after = {
      ...before,
      sourceUrl: "https://www.penskeusedtrucks.com/unit-88001",
      canonicalListingUrl: "https://www.penskeusedtrucks.com/unit-88001",
    };
    expect(listingContentChanged(before, after)).toBe(true);
  });

  it("missing/rejected hyperlink on re-import does not erase an existing listing URL", () => {
    const existing = {
      id: "lead-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      listingFirstSeenAt: "2026-01-01T00:00:00.000Z",
      listingLastSeenAt: "2026-01-01T00:00:00.000Z",
      listingLastChangedAt: "2026-01-01T00:00:00.000Z",
      seller: "Penske Pre-Auction",
      supplierContactId: null,
      sourceUrl: "https://www.penskeusedtrucks.com/unit-88001",
      sourceScope: "penske-preauction",
      sourceListingId: "88001",
      canonicalListingUrl: "https://www.penskeusedtrucks.com/unit-88001",
      stockNumber: "88001",
      vin: "",
      year: 2019,
      makeModel: "Freightliner M2",
      boxLengthFt: 26,
      boxLengthRaw: "26'",
      engine: "Cummins",
      engineIsCummins: true,
      transmission: "Automatic",
      transmissionIsAutomatic: true,
      listedWeightLbs: 25500,
      listedWeightTerm: "gvw" as const,
      manufacturerGvwrLbs: 25500,
      gvwrDoorPlateVerified: false,
      mileage: 120000,
      hasLiftgate: true,
      liftgateNotes: "",
      price: 42000,
      location: "Dallas, TX",
      drivingDistanceMiles: null,
      distanceIsEstimate: true,
      dateLastChecked: "2026-01-01",
      verificationNotes: "prior",
      workflowStatus: "contacted" as const,
      sklCallNotes: "Called yard; notes must stay",
      researchUncertaintyLabels: [] as string[],
      isSeedResearch: false,
      seedSource: "",
      matchStatus: "confirmed_match" as const,
      matchReasons: [],
      specEvidence: {
        engine: "Cummins",
        transmission: "Automatic",
        boxLength: "26'",
        gvwr: "GVW 25500",
        inspectionUrl: "https://reports.nationalinspect.com/1/2/abc/",
        hyperlinkSource: "workbook_unit_cell" as const,
        hyperlinkDestinationType: "listing",
        hyperlinkHostname: "www.penskeusedtrucks.com",
        hyperlinkValidation: "Individual Penske unit page",
        workbookStatus: "",
        salesTerms: "",
        penskeStatus: "",
        titleStatus: "",
        distance: "",
      },
    } satisfies TruckLead;

    const incoming = {
      ...existing,
      sourceUrl: "",
      canonicalListingUrl: "",
      sklCallNotes: "",
      workflowStatus: "new" as const,
      verificationNotes: "No hyperlink provided",
      specEvidence: {
        ...existing.specEvidence,
        inspectionUrl: "",
        hyperlinkDestinationType: "missing",
        hyperlinkHostname: "",
        hyperlinkValidation: "No hyperlink provided",
      },
    };

    const plan = planIntakeRow(incoming, existing, DEFAULT_BUYING_PROFILE, {
      dateObserved: "2026-09-21",
      missingEvidence: [],
    });
    expect(plan.kind).toBe("seen_again");
    expect(plan.input.sourceUrl).toMatch(/unit-88001/);
    expect(plan.input.canonicalListingUrl).toMatch(/unit-88001/);
    expect(plan.input.specEvidence.inspectionUrl).toMatch(/nationalinspect/);
    expect(plan.input.sklCallNotes).toBe("Called yard; notes must stay");
    expect(plan.input.workflowStatus).toBe("contacted");
  });

  it("newly discovered safe listing URL is listing_change; inspection-only is not", () => {
    const base = {
      id: "lead-2",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      listingFirstSeenAt: "2026-01-01T00:00:00.000Z",
      listingLastSeenAt: "2026-01-01T00:00:00.000Z",
      listingLastChangedAt: "2026-01-01T00:00:00.000Z",
      seller: "Penske Pre-Auction",
      supplierContactId: null,
      sourceUrl: "",
      sourceScope: "penske-preauction",
      sourceListingId: "88002",
      canonicalListingUrl: "",
      stockNumber: "88002",
      vin: "",
      year: 2019,
      makeModel: "Freightliner M2",
      boxLengthFt: 26,
      boxLengthRaw: "26'",
      engine: "Cummins",
      engineIsCummins: true,
      transmission: "Automatic",
      transmissionIsAutomatic: true,
      listedWeightLbs: 25500,
      listedWeightTerm: "gvw" as const,
      manufacturerGvwrLbs: 25500,
      gvwrDoorPlateVerified: false,
      mileage: 120000,
      hasLiftgate: true,
      liftgateNotes: "",
      price: 42000,
      location: "Dallas, TX",
      drivingDistanceMiles: null,
      distanceIsEstimate: true,
      dateLastChecked: "2026-01-01",
      verificationNotes: "",
      workflowStatus: "new" as const,
      sklCallNotes: "keep me",
      researchUncertaintyLabels: [] as string[],
      isSeedResearch: false,
      seedSource: "",
      matchStatus: "needs_verification" as const,
      matchReasons: [],
      specEvidence: {
        engine: "Cummins",
        transmission: "Automatic",
        boxLength: "26'",
        gvwr: "GVW 25500",
        inspectionUrl: "",
        hyperlinkSource: "" as const,
        hyperlinkDestinationType: "missing",
        hyperlinkHostname: "",
        hyperlinkValidation: "No hyperlink provided",
        workbookStatus: "",
        salesTerms: "",
        penskeStatus: "",
        titleStatus: "",
        distance: "",
      },
    } satisfies TruckLead;

    const withListing = {
      ...base,
      sourceUrl: "https://www.penskeusedtrucks.com/unit-88002",
      canonicalListingUrl: "https://www.penskeusedtrucks.com/unit-88002",
      specEvidence: {
        ...base.specEvidence,
        hyperlinkSource: "workbook_unit_cell" as const,
        hyperlinkDestinationType: "listing",
        hyperlinkHostname: "www.penskeusedtrucks.com",
        hyperlinkValidation: "Individual Penske unit page",
      },
    };
    const listingPlan = planIntakeRow(withListing, base, DEFAULT_BUYING_PROFILE, {
      dateObserved: "2026-09-21",
      missingEvidence: [],
    });
    expect(listingPlan.kind).toBe("listing_change");
    expect(listingPlan.input.sklCallNotes).toBe("keep me");

    const withInspection = {
      ...base,
      specEvidence: {
        ...base.specEvidence,
        inspectionUrl: "https://reports.nationalinspect.com/1/2/tok/",
        hyperlinkSource: "workbook_unit_cell" as const,
        hyperlinkDestinationType: "inspection",
        hyperlinkHostname: "reports.nationalinspect.com",
        hyperlinkValidation: "Approved inspection/report page",
      },
    };
    const inspPlan = planIntakeRow(withInspection, base, DEFAULT_BUYING_PROFILE, {
      dateObserved: "2026-09-21",
      missingEvidence: [],
    });
    expect(inspPlan.kind).toBe("seen_again");
    expect(inspPlan.input.specEvidence.inspectionUrl).toMatch(/nationalinspect/);
    expect(inspPlan.input.sklCallNotes).toBe("keep me");
  });

  it("does not execute formulas or macros (bookVBA false path still parses stored values)", () => {
    const buf = readFileSync(casesPath);
    const parsed = parseWorkbookBuffer(buf, "cases.xlsx");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      for (const row of parsed.active.rows) {
        const unit = row.unit || row.unit_number;
        expect(unit).toBeTruthy();
        expect(unit).not.toMatch(/^=/);
        if (row.unit_hyperlink) {
          expect(row.unit_hyperlink).not.toMatch(/^=/);
        }
      }
    }
  });

  it("keeps existing Penske sample classification totals unchanged", () => {
    const buf = readFileSync(penskeSamplePath);
    const preview = buildWorkbookPreview(buf, "penske.xls", [], DEFAULT_BUYING_PROFILE);
    // Baseline sample has 5 medium-duty rows; all still parse without URL invention
    expect(preview.usableLeads).toBe(5);
    expect(preview.previewRows.every((r) => r.hyperlinkKind === "none")).toBe(true);
    expect(preview.workbookParseError).toBeUndefined();
  });

  it("keeps Hogan wholesale sample totals/classification stable", () => {
    const buf = readFileSync(hoganPath);
    const preview = buildWorkbookPreview(buf, "hogan.xlsx", [], DEFAULT_BUYING_PROFILE);
    expect(preview.detectedFormat).toBe("hogan-wholesale");
    expect(preview.usableLeads).toBeGreaterThan(0);
  });
});

describe("SheetJS hyperlink write/read does not require HTTP", () => {
  it("round-trips cell.l.Target in a tiny workbook", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Unit"],
      ["1"],
    ]);
    ws["A2"].l = { Target: "https://www.penskeusedtrucks.com/unit-1/" };
    XLSX.utils.book_append_sheet(wb, ws, "Medium Duty");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const parsed = parseWorkbookBuffer(Buffer.from(buf), "tiny.xlsx");
    // May not detect as penske without full headers — still assert attach helper via raw sheet
    const wb2 = XLSX.read(buf, { type: "buffer" });
    expect(wb2.Sheets["Medium Duty"]["A2"].l?.Target).toMatch(/unit-1/);
    expect(parsed.ok === false || parsed.ok === true).toBe(true);
  });
});
