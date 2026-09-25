/**
 * Regression: redirect that loses listing identity must not become import-eligible.
 * Proxibid lot → category hub; Signature VIN VDPs remain eligible.
 */
import { describe, expect, it, vi } from "vitest";
import { classifyDiscoveryUrl } from "@/lib/sourcing/search/discovery/url-classify";
import {
  assertRedirectPreservesListingIdentity,
  extractListingIdentityKeys,
  hasImportableUnitEvidence,
  pathLooksLikeCategoryOrMarketplaceHub,
  pickPageBackedIdentityFields,
  REDIRECT_LOST_LISTING_IDENTITY,
} from "@/lib/sourcing/search/discovery-inspect/listing-identity";
import { inspectListingHtmlDeterministic } from "@/lib/sourcing/search/discovery-inspect/deterministic-inspect";
import { revalidateSelectedUrlsForImport } from "@/lib/sourcing/search/discovery-inspect/import-selected";
import { runDiscoveryInspectPreview } from "@/lib/sourcing/search/discovery-inspect/preview";
import { validateDiscoveryCandidate } from "@/lib/sourcing/search/discovery-inspect/validate-url";
import type { DiscoverySearchClient } from "@/lib/sourcing/search/discovery/types";
import type { ExtractedTruckCandidate } from "@/lib/sourcing/search/types";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";
import { hasPositiveRefrigeratedBodyEvidence } from "@/lib/sourcing/body-policy";
import { classifyLead, type LeadMatchInput } from "@/lib/sourcing/match";

const PROXIBID_LOT =
  "https://www.proxibid.com/aspr/2019-freightliner-m2-106-26ft-box-truck/98818898/lotdetail.asp?lid=98818898";
const PROXIBID_HUB = "https://www.proxibid.com/for-sale/heavy-construction-equipment";

const SIGNATURE_FREIGHTLINER =
  "https://www.signaturetruckcenter.com/inventory/used-2020-freightliner-m2-28ft-box-truck-3alacwfc7ldlt8351-in-crystal-lake-il";
const SIGNATURE_INTERNATIONAL =
  "https://www.signaturetruckcenter.com/inventory/used-2020-international-mv607-26ft-box-truck-with-lift-gate-1hteumml5lh842637-in-crystal-lake-il";

function signatureHtml(args: {
  url: string;
  vin: string;
  stock: string;
  year: number;
  makeModel: string;
  boxFt: number;
  mileage: number;
  price: number;
}): string {
  return `<!doctype html><html><head>
<title>Used ${args.year} ${args.makeModel} | VIN: ${args.vin}</title>
<script type="application/ld+json">{"@type":"Vehicle","name":"${args.makeModel}","vehicleIdentificationNumber":"${args.vin}","mileageFromOdometer":{"value":${args.mileage}}}</script>
</head><body>
<p>Stock # ${args.stock}</p>
<p>${args.year} ${args.makeModel}</p>
<p>Cummins ISB 6.7</p>
<p>Automatic transmission</p>
<p>${args.boxFt} foot box</p>
<p>GVWR 26,000 lbs</p>
<p>Liftgate</p>
<p>Crystal Lake, IL</p>
<p>Asking price $${args.price.toLocaleString("en-US")}</p>
<p>Call (815) 310-3320</p>
<p>VIN ${args.vin}</p>
</body></html>`;
}

const FREIGHTLINER_HTML = signatureHtml({
  url: SIGNATURE_FREIGHTLINER,
  vin: "3ALACWFC7LDLT8351",
  stock: "18534",
  year: 2020,
  makeModel: "Freightliner M2 28ft Box Truck",
  boxFt: 28,
  mileage: 169454,
  price: 44900,
});

const INTERNATIONAL_HTML = signatureHtml({
  url: SIGNATURE_INTERNATIONAL,
  vin: "1HTEUMML5LH842637",
  stock: "18380",
  year: 2020,
  makeModel: "International MV607 26ft Box Truck with Lift Gate",
  boxFt: 26,
  mileage: 183376,
  price: 32900,
});

const HUB_HTML = `<!doctype html><html><head><title>Heavy Construction Equipment Auctions | Proxibid</title></head>
<body><h1>Heavy Construction Equipment</h1><p>Browse auctions</p></body></html>`;

function fixtureFetchImpl(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/lotdetail\.asp|98818898/i.test(url)) {
      return new Response(null, {
        status: 302,
        headers: { location: PROXIBID_HUB },
      });
    }
    if (/for-sale\/heavy-construction-equipment/i.test(url)) {
      return new Response(HUB_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (/3alacwfc7ldlt8351/i.test(url)) {
      return new Response(FREIGHTLINER_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (/1hteumml5lh842637/i.test(url)) {
      return new Response(INTERNATIONAL_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

function fixtureSearchClient(urls: string[]): DiscoverySearchClient {
  return {
    async search(_query, options) {
      const max = options?.maxResults ?? 10;
      return {
        results: urls.slice(0, max).map((url) => ({
          url,
          title: url,
        })),
        creditsCharged: 1,
      };
    },
  };
}

describe("listing identity helpers", () => {
  it("treats Proxibid /for-sale/heavy-construction-equipment as category hub", () => {
    expect(pathLooksLikeCategoryOrMarketplaceHub("/for-sale/heavy-construction-equipment")).toBe(
      true
    );
    expect(classifyDiscoveryUrl(PROXIBID_HUB).bucket).toBe("hub_or_category");
  });

  it("detects lost identity when lot redirects to category hub", () => {
    const result = assertRedirectPreservesListingIdentity(PROXIBID_LOT, PROXIBID_HUB, HUB_HTML);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(REDIRECT_LOST_LISTING_IDENTITY);
  });

  it("rejects generic hub scrape as importable unit evidence", () => {
    const truck: ExtractedTruckCandidate = {
      listingUrl: PROXIBID_HUB,
      evidenceUrl: PROXIBID_HUB,
      sourceName: "Proxibid",
      seller: "Proxibid",
      stockNumber: "N/A",
      vin: "N/A",
      year: null,
      makeModel: "N/A",
      engine: "N/A",
      engineIsCummins: null,
      engineEvidence: "N/A",
      transmission: "N/A",
      transmissionIsAutomatic: null,
      transmissionEvidence: "N/A",
      boxLengthFt: null,
      boxLengthEvidence: "N/A",
      manufacturerGvwrLbs: null,
      listedWeightLbs: null,
      listedWeightTerm: "unknown",
      gvwrEvidence: "N/A",
      mileage: null,
      hasLiftgate: null,
      askingPrice: null,
      auctionCurrentBid: null,
      location: "N/A",
      drivingDistanceMiles: null,
      distanceIsEstimate: false,
      phone: "N/A",
      contactName: "N/A",
      contactRole: "N/A",
      notes: "This URL does not correspond to an individual vehicle listing.",
    };
    const gate = hasImportableUnitEvidence({
      truck,
      finalUrl: PROXIBID_HUB,
      html: HUB_HTML,
    });
    expect(gate.ok).toBe(false);
  });
});

describe("Proxibid lot → hub redirect regression", () => {
  it("rejects at validation with lost identity or hub reason; no OpenAI; not import-eligible", async () => {
    const openAi = vi.fn(async () => {
      throw new Error("OpenAI must not run for Proxibid hub redirect");
    });

    const validated = await validateDiscoveryCandidate(PROXIBID_LOT, {
      fetchImpl: fixtureFetchImpl(),
    });
    expect(validated.outcome).toBe("rejected");
    expect(validated.reason).toMatch(
      /Redirect lost individual listing identity|category\/search\/hub|marketplace for-sale/i
    );

    const preview = await runDiscoveryInspectPreview({
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      mode: "live",
      confirmPaidProviders: true,
      allowLiveNetwork: false,
      tavilyClient: fixtureSearchClient([PROXIBID_LOT]),
      validateFetchImpl: fixtureFetchImpl(),
      openAiInspectUrl: openAi,
      ceilings: {
        maxQueries: 1,
        maxTavilyCredits: 1,
        maxRetainedListingUrls: 5,
        maxInspectCandidates: 5,
        maxOpenAiInspectCalls: 5,
      },
    });

    expect(preview.dbWrites).toBe(false);
    expect(preview.openAiInspectCalls).toBe(0);
    expect(openAi).not.toHaveBeenCalled();

    const row = preview.rows.find(
      (r) =>
        /proxibid/i.test(r.discoveryUrl) ||
        /proxibid/i.test(r.finalUrl) ||
        /98818898|heavy-construction/i.test(r.finalUrl)
    );
    expect(row).toBeTruthy();
    expect(row!.importEligible).toBe(false);
    expect(["rejected_pre_inspect", "does_not_match", "unverified"]).toContain(
      row!.previewOutcome
    );
    expect(row!.previewOutcome).not.toBe("needs_verification");
    expect(preview.rejectedBeforeInspect.some((r) => /proxibid|98818898|heavy-construction/i.test(r.url))).toBe(
      true
    );
  });
});

describe("Signature Truck Center VIN pages remain eligible", () => {
  it("keeps both Signature VINs import-eligible after validation + inspect", async () => {
    const preview = await runDiscoveryInspectPreview({
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      mode: "mock",
      confirmPaidProviders: true,
      allowLiveNetwork: false,
      tavilyClient: fixtureSearchClient([SIGNATURE_FREIGHTLINER, SIGNATURE_INTERNATIONAL]),
      validateFetchImpl: fixtureFetchImpl(),
      ceilings: {
        maxQueries: 2,
        maxTavilyCredits: 2,
        maxRetainedListingUrls: 10,
        maxInspectCandidates: 10,
        maxOpenAiInspectCalls: 0,
      },
    });

    expect(preview.dbWrites).toBe(false);
    const freight = preview.rows.find((r) => /3ALACWFC7LDLT8351/i.test(r.finalUrl));
    const intl = preview.rows.find((r) => /1HTEUMML5LH842637/i.test(r.finalUrl));
    expect(freight?.importEligible).toBe(true);
    expect(intl?.importEligible).toBe(true);
    expect(freight?.truck?.vin?.toUpperCase()).toBe("3ALACWFC7LDLT8351");
    expect(intl?.truck?.vin?.toUpperCase()).toBe("1HTEUMML5LH842637");
    expect(freight?.reasons.length).toBeGreaterThan(1);
    expect(intl?.reasons.length).toBeGreaterThan(1);
  });
});

describe("Import rejects Proxibid hub URL submitted by client", () => {
  it("rejects direct Import of the Proxibid category hub", async () => {
    const result = await revalidateSelectedUrlsForImport({
      selectedUrls: [PROXIBID_HUB],
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      fetchImpl: fixtureFetchImpl(),
      deadlineAt: Date.now() + 60_000,
    });
    expect(result.trucks).toHaveLength(0);
    expect(result.tavilyCalls).toBe(0);
    expect(result.openAiCalls).toBe(0);
    expect(result.rejected.some((r) => /proxibid|hub|category|for-sale|identity/i.test(r.reason))).toBe(
      true
    );
  });

  it("rejects Import of Proxibid lot URL that redirects to hub", async () => {
    const result = await revalidateSelectedUrlsForImport({
      selectedUrls: [PROXIBID_LOT],
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      fetchImpl: fixtureFetchImpl(),
      deadlineAt: Date.now() + 60_000,
    });
    expect(result.trucks).toHaveLength(0);
    expect(result.rejected[0]?.reason).toMatch(
      /Redirect lost individual listing identity|category\/search\/hub|marketplace for-sale/i
    );
  });
});

/**
 * Rhode Island identity contradiction regression (sanitized fixtures).
 * Live Preview showed OpenAI VIN/stock (VDXP3542) while the final HTML had
 * VDXK3543 + listing id 14437263 — page-backed gate must use HTML/URL evidence.
 */
const RI_URL =
  "https://www.rhodeislandtruckcenter.com/for-sale/2027-freightliner-m2-box-truck-14437263";
const RI_PAGE_VIN = "3ALACWFC9VDXK3543";
const RI_PAGE_STOCK = "VDXK3543";
const RI_MODEL_ONLY_VIN = "3ALACWFC9VDXP3542";
const RI_MODEL_ONLY_STOCK = "VDXP3542";

const RI_HTML = `<!doctype html><html><head>
<title>2027 Freightliner M2 106 Plus 26' Box Truck</title>
</head><body>
<a data-src="/instant/contact?productid=14437263" href="javascript:;"></a>
<table>
<tr><td>Stock Number</td><td>${RI_PAGE_STOCK}</td></tr>
<tr><td>Product ID</td><td>14437263</td></tr>
<tr><td>VIN</td><td>${RI_PAGE_VIN}</td></tr>
</table>
<p>2027 Freightliner M2 106 Plus 26 foot dry box. Cummins B6.7. Allison automatic transmission. GVWR 26000 lbs. Power liftgate. Warwick, RI. Asking price $89,900.</p>
</body></html>`;

function baseTruck(overrides: Partial<ExtractedTruckCandidate> = {}): ExtractedTruckCandidate {
  return {
    listingUrl: RI_URL,
    evidenceUrl: RI_URL,
    sourceName: "rhodeislandtruckcenter",
    seller: "Rhode Island Truck Center",
    stockNumber: RI_PAGE_STOCK,
    vin: RI_PAGE_VIN,
    year: 2027,
    makeModel: "Freightliner M2 Box Truck",
    engine: "Cummins B6.7",
    engineIsCummins: true,
    engineEvidence: "Cummins B6.7",
    transmission: "Allison automatic",
    transmissionIsAutomatic: true,
    transmissionEvidence: "Allison automatic",
    boxLengthFt: 26,
    boxLengthEvidence: "26 foot",
    manufacturerGvwrLbs: 26000,
    listedWeightLbs: 26000,
    listedWeightTerm: "gvwr",
    gvwrEvidence: "GVWR 26000 lbs",
    mileage: null,
    hasLiftgate: true,
    askingPrice: 89900,
    auctionCurrentBid: null,
    location: "Warwick, RI",
    drivingDistanceMiles: null,
    distanceIsEstimate: false,
    phone: "",
    contactName: "",
    contactRole: "",
    notes: "",
    ...overrides,
  };
}

function riMatchLead(overrides: Partial<LeadMatchInput> = {}): LeadMatchInput {
  return {
    year: 2027,
    boxLengthFt: 26,
    engineIsCummins: true,
    transmissionIsAutomatic: true,
    listedWeightLbs: 26000,
    listedWeightTerm: "gvwr",
    manufacturerGvwrLbs: 26000,
    gvwrDoorPlateVerified: false,
    mileage: null,
    hasLiftgate: true,
    drivingDistanceMiles: null,
    price: 89900,
    location: "Warwick, RI",
    makeModel: "Freightliner M2 26ft dry box",
    ...overrides,
  };
}

describe("page-backed identity evidence (Rhode Island contradiction)", () => {
  it("extracts trailing listing id from dealer VDP slug", () => {
    expect(extractListingIdentityKeys(RI_URL)).toContain("14437263");
  });

  it("final page contains VIN → importable unit evidence", () => {
    const gate = hasImportableUnitEvidence({
      truck: baseTruck({ stockNumber: "N/A", vin: RI_PAGE_VIN }),
      finalUrl: RI_URL,
      html: RI_HTML,
    });
    expect(gate.ok).toBe(true);
  });

  it("final page contains stock ID → importable unit evidence", () => {
    const gate = hasImportableUnitEvidence({
      truck: baseTruck({ vin: "N/A", stockNumber: RI_PAGE_STOCK }),
      finalUrl: RI_URL,
      html: RI_HTML,
    });
    expect(gate.ok).toBe(true);
  });

  it("listing id on URL + HTML qualifies even when truck VIN/stock are placeholders", () => {
    const gate = hasImportableUnitEvidence({
      truck: baseTruck({ vin: "N/A", stockNumber: "N/A" }),
      finalUrl: RI_URL,
      html: RI_HTML,
    });
    expect(gate.ok).toBe(true);
  });

  it("OpenAI supplies an identifier absent from HTML → rejected", () => {
    const gate = hasImportableUnitEvidence({
      truck: baseTruck({
        vin: RI_MODEL_ONLY_VIN,
        stockNumber: RI_MODEL_ONLY_STOCK,
        listingUrl: "https://www.rhodeislandtruckcenter.com/for-sale/generic-box-truck",
      }),
      finalUrl: "https://www.rhodeislandtruckcenter.com/for-sale/generic-box-truck",
      html: RI_HTML.replaceAll("14437263", "99999999"),
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toMatch(/missing VIN or stock\/unit\/lot\/listing ID supported by the final page/i);
    }
  });

  it("mismatched identifier (model VIN ≠ page VIN) does not page-qualify", () => {
    const picked = pickPageBackedIdentityFields({
      deterministic: { vin: RI_PAGE_VIN, stockNumber: RI_PAGE_STOCK },
      model: { vin: RI_MODEL_ONLY_VIN, stockNumber: RI_MODEL_ONLY_STOCK },
      finalUrl: RI_URL,
      html: RI_HTML,
    });
    expect(picked.vin).toBe(RI_PAGE_VIN);
    expect(picked.stockNumber).toBe(RI_PAGE_STOCK);

    const gate = hasImportableUnitEvidence({
      truck: baseTruck({
        vin: RI_MODEL_ONLY_VIN,
        stockNumber: RI_MODEL_ONLY_STOCK,
      }),
      finalUrl: "https://www.rhodeislandtruckcenter.com/for-sale/generic-box-truck",
      html: `<html><body><p>2027 Freightliner M2. VIN ${RI_PAGE_VIN}. Stock ${RI_PAGE_STOCK}.</p></body></html>`,
    });
    // Model-only tokens absent from this HTML path without listing id → reject
    expect(gate.ok).toBe(false);
  });

  it("deterministic HTML extract recovers page VIN and Stock Number label", () => {
    const det = inspectListingHtmlDeterministic({
      finalUrl: RI_URL,
      html: RI_HTML,
      title: "2027 Freightliner M2 Box Truck",
    });
    expect(det.truck.vin.toUpperCase()).toBe(RI_PAGE_VIN);
    expect(det.truck.stockNumber.toUpperCase()).toBe(RI_PAGE_STOCK);
  });

  it("Preview: OpenAI model-only VIN/stock rejected; page VIN survives merge → eligible when SKL rules allow", async () => {
    const openAi = vi.fn(async () => ({
      truck: baseTruck({
        vin: RI_MODEL_ONLY_VIN,
        stockNumber: RI_MODEL_ONLY_STOCK,
        engineEvidence: "Cummins B6.7",
        transmissionEvidence: "Allison automatic",
        boxLengthEvidence: "26 foot",
        gvwrEvidence: "GVWR 26000",
        engineIsCummins: true,
        transmissionIsAutomatic: true,
        boxLengthFt: 26,
        manufacturerGvwrLbs: 26000,
      }),
    }));

    // HTML missing engine/trans/box/gvwr phrases so OpenAI runs, but still has VIN/stock/listing id.
    const incompleteButIdentified = `<!doctype html><html><head><title>2027 Freightliner M2</title></head>
<body>
<a data-src="/instant/contact?productid=14437263"></a>
<p>Stock Number ${RI_PAGE_STOCK}</p>
<p>VIN ${RI_PAGE_VIN}</p>
<p>2027 Freightliner M2 Box Truck Warwick RI</p>
</body></html>`;

    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/rhodeislandtruckcenter|14437263/i.test(url)) {
        return new Response(incompleteButIdentified, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const preview = await runDiscoveryInspectPreview({
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      mode: "mock",
      confirmPaidProviders: true,
      allowLiveNetwork: false,
      tavilyClient: fixtureSearchClient([RI_URL]),
      validateFetchImpl: fetchImpl,
      openAiInspectUrl: openAi,
      ceilings: {
        maxQueries: 1,
        maxTavilyCredits: 1,
        maxRetainedListingUrls: 5,
        maxInspectCandidates: 5,
        maxOpenAiInspectCalls: 5,
      },
    });

    expect(openAi).toHaveBeenCalled();
    const row = preview.rows.find((r) => /14437263|rhodeisland/i.test(r.finalUrl));
    expect(row).toBeTruthy();
    // Page-backed VIN survives; model-only VDXP* does not.
    expect(row!.truck?.vin?.toUpperCase()).toBe(RI_PAGE_VIN);
    expect(row!.truck?.vin?.toUpperCase()).not.toBe(RI_MODEL_ONLY_VIN);
    expect(row!.truck?.stockNumber?.toUpperCase()).toBe(RI_PAGE_STOCK);
    // Unit evidence ok — importEligible only when classifyLead allows
    // (Warwick RI + unknown distance → needs_verification → eligible).
    expect(row!.importEligible).toBe(true);
    expect(["confirmed_match", "needs_verification"]).toContain(row!.previewOutcome);
  });

  it("Rhode Island becomes import-eligible only when other SKL rules also pass", () => {
    const unitOk = hasImportableUnitEvidence({
      truck: baseTruck(),
      finalUrl: RI_URL,
      html: RI_HTML,
    });
    expect(unitOk.ok).toBe(true);

    const needsVerification = classifyLead(riMatchLead(), DEFAULT_BUYING_PROFILE);
    expect(needsVerification.status).toBe("needs_verification");

    const reeferText = "2027 Freightliner M2 26ft refrigerated reefer box truck";
    expect(hasPositiveRefrigeratedBodyEvidence(reeferText)).toBe(true);
    const reeferLead = classifyLead(
      riMatchLead({ makeModel: reeferText, title: reeferText }),
      DEFAULT_BUYING_PROFILE
    );
    expect(reeferLead.status).toBe("does_not_match");

    const pompano = classifyLead(
      riMatchLead({
        location: "Pompano Beach, FL",
        drivingDistanceMiles: 1400,
        makeModel: "2020 Freightliner M2 dry box",
        year: 2020,
      }),
      DEFAULT_BUYING_PROFILE
    );
    expect(pompano.status).toBe("does_not_match");
    expect(pompano.reasons.find((r) => r.code === "distance")?.outcome).toBe("fail");
  });
});
