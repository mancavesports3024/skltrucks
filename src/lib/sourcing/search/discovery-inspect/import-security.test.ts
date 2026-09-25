/**
 * Import revalidation + OpenAI URL mismatch + Preview deadline regressions.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createMockDiscoveryInspectSearchClient,
  createMockValidateFetchImpl,
  mockHtmlForUrl,
} from "@/lib/sourcing/search/discovery-inspect/mock";
import { revalidateSelectedUrlsForImport } from "@/lib/sourcing/search/discovery-inspect/import-selected";
import { runDiscoveryInspectPreview } from "@/lib/sourcing/search/discovery-inspect/preview";
import type { ExtractedTruckCandidate } from "@/lib/sourcing/search/types";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

const UNIT_A =
  "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001";
const UNIT_B =
  "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-217623";
const HUB =
  "https://www.freightlinerfl.com/delivery-moving-straight-box-trucks-for-sale-i2c44f0m0";
const OTHER_TRUCK_URL =
  "https://www.akinscargovan.com/inventory/used-2021-international-mv-evil-tamper-99999";

function compellingTruck(url: string, overrides: Partial<ExtractedTruckCandidate> = {}): ExtractedTruckCandidate {
  return {
    listingUrl: url,
    evidenceUrl: url,
    sourceName: "Evil Dealer",
    seller: "TAMPERED SELLER INC",
    stockNumber: "EVIL-999",
    vin: "1XPWD40X1ED215100",
    year: 2022,
    makeModel: "Freightliner M2 Tampered",
    engine: "Cummins ISB 6.7",
    engineIsCummins: true,
    engineEvidence: "Cummins ISB 6.7",
    transmission: "Allison automatic",
    transmissionIsAutomatic: true,
    transmissionEvidence: "Allison automatic",
    boxLengthFt: 26,
    boxLengthEvidence: "26 ft",
    manufacturerGvwrLbs: 26000,
    listedWeightLbs: 26000,
    listedWeightTerm: "gvwr",
    gvwrEvidence: "GVWR 26000",
    mileage: 90000,
    hasLiftgate: true,
    askingPrice: 99999,
    auctionCurrentBid: null,
    location: "Joplin, MO",
    drivingDistanceMiles: 10,
    distanceIsEstimate: true,
    phone: "(999) 555-9999",
    contactName: "Tampered",
    contactRole: "",
    notes: "tampered",
    ...overrides,
  };
}

describe("OpenAI URL mismatch discards entire result", () => {
  it("does not merge any facts when OpenAI returns a different listing URL", async () => {
    const incompleteHtml = `<!doctype html><html><head><title>2019 Freightliner</title>
<script type="application/ld+json">{"@type":"Vehicle","name":"Freightliner M2","vehicleIdentificationNumber":"1HTEUMML5LH842637"}</script>
</head><body><p>Stock # 9001</p><p>VIN 1HTEUMML5LH842637</p><p>Joplin, MO</p></body></html>`;

    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/debary|unit-217623|14496496/i.test(url) && !/pdf|403|bot/i.test(url)) {
        return new Response(incompleteHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return createMockValidateFetchImpl()(input);
    }) as typeof fetch;

    const openAi = vi.fn(async () => ({
      truck: compellingTruck(OTHER_TRUCK_URL, {
        vin: "3HAEUMML7ML657596",
        askingPrice: 77777,
        engine: "SHOULD-NOT-SURVIVE Cummins",
        manufacturerGvwrLbs: 26000,
        mileage: 11111,
      }),
    }));

    const preview = await runDiscoveryInspectPreview({
      mode: "mock",
      confirmPaidProviders: true,
      tavilyClient: createMockDiscoveryInspectSearchClient(),
      validateFetchImpl: fetchImpl,
      openAiInspectUrl: openAi,
      ceilings: { maxOpenAiInspectCalls: 10 },
      previewDeadlineMs: 60_000,
    });

    expect(openAi).toHaveBeenCalled();
    expect(preview.errors.some((e) => /inspection URL mismatch/i.test(e))).toBe(true);

    for (const row of preview.rows) {
      if (!row.truck) continue;
      expect(row.truck.askingPrice).not.toBe(77777);
      expect(row.truck.engine).not.toMatch(/SHOULD-NOT-SURVIVE/i);
      expect(row.truck.mileage).not.toBe(11111);
      expect(row.reasons.join(" ")).toMatch(/inspection URL mismatch/i);
      // OpenAI VIN must not replace deterministic VIN on the submitted URL.
      if (row.finalUrl.includes("debary") || row.finalUrl.includes("unit-217623")) {
        expect(row.truck.vin).toBe("1HTEUMML5LH842637");
      }
    }
  });
});

describe("Import never trusts client Preview payload", () => {
  it("ignores client truck fields — only selected URLs; hubs/rejected stay out", async () => {
    const fetchImpl = createMockValidateFetchImpl();
    const result = await revalidateSelectedUrlsForImport({
      selectedUrls: [UNIT_A, HUB, "https://www.justanswer.com/medium-and-heavy-truck/x.html"],
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      fetchImpl,
    });

    expect(result.tavilyCalls).toBe(0);
    expect(result.openAiCalls).toBe(0);
    expect(result.trucks.every((t) => t.listingUrl.includes("debary"))).toBe(true);
    expect(result.trucks.some((t) => /justanswer|i2c44/i.test(t.listingUrl))).toBe(false);
    expect(result.rejected.some((r) => /justanswer|hub|category|i2c44/i.test(r.url + r.reason))).toBe(
      true
    );
  });

  it("cannot flip importEligible / Rejected via client — Canada / GVWR 26001 pages stay rejected", async () => {
    const canadaHtml = `<!doctype html><html><head><title>2019 Cummins Box</title></head><body>
      <p>VIN 1HTEUMML5LH842637</p><p>Cummins ISB</p><p>Allison automatic</p>
      <p>26 foot box</p><p>GVWR 26,000 lbs</p><p>Toronto, ON, Canada</p><p>$45,000</p>
    </body></html>`;

    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/canada-unit/i.test(url)) {
        return new Response(canadaHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return createMockValidateFetchImpl()(input);
    }) as typeof fetch;

    const result = await revalidateSelectedUrlsForImport({
      selectedUrls: [
        "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-canada-unit-9001",
      ],
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      fetchImpl,
    });

    // Even if a client claimed importEligible:true / needs_verification, server reclassifies.
    expect(result.trucks.length).toBe(0);
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("cannot inject VIN/price/engine/GVWR/mileage/URL/seller via client — facts come from re-fetch", async () => {
    const result = await revalidateSelectedUrlsForImport({
      selectedUrls: [UNIT_A],
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      fetchImpl: createMockValidateFetchImpl(),
    });

    expect(result.trucks.length).toBe(1);
    const t = result.trucks[0];
    const page = mockHtmlForUrl(UNIT_A);
    expect(page.ok).toBe(true);
    if (page.ok) {
      expect(t.vin).toBe("1HTEUMML5LH842637");
      expect(t.listingUrl).toContain("debary");
      expect(t.vin).not.toBe("1XPWD40X1ED215100");
      expect(t.askingPrice).not.toBe(99999);
      expect(t.seller).not.toBe("TAMPERED SELLER INC");
    }
  });

  it("cannot expand one selected URL into an arbitrary additional truck", async () => {
    const result = await revalidateSelectedUrlsForImport({
      selectedUrls: [UNIT_A],
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      fetchImpl: createMockValidateFetchImpl(),
    });
    expect(result.trucks.length).toBe(1);
    expect(result.trucks[0].listingUrl).toContain("debary");
    expect(result.trucks.some((t) => t.listingUrl.includes("penske"))).toBe(false);
    expect(result.trucks.some((t) => t.listingUrl.includes("truckandvanoutlet"))).toBe(false);
  });

  it("caps selected URLs and never calls providers", async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      i === 0 ? UNIT_A : `${UNIT_A}?dup=${i}`
    );
    const result = await revalidateSelectedUrlsForImport({
      selectedUrls: many,
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      fetchImpl: createMockValidateFetchImpl(),
    });
    expect(result.tavilyCalls).toBe(0);
    expect(result.openAiCalls).toBe(0);
    // Cap is 10 unique canonicals — query variants may collapse via canonicalize.
    expect(result.trucks.length + result.rejected.length).toBeLessThanOrEqual(10);
  });

  it("rejects duplicate already in SKL", async () => {
    const first = await revalidateSelectedUrlsForImport({
      selectedUrls: [UNIT_A],
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      fetchImpl: createMockValidateFetchImpl(),
    });
    expect(first.trucks.length).toBe(1);
    const mappedVin = first.trucks[0].vin;

    const second = await revalidateSelectedUrlsForImport({
      selectedUrls: [UNIT_A, UNIT_B],
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [
        {
          id: "existing-1",
          seller: "Dealer",
          supplierContactId: null,
          sourceUrl: UNIT_A,
          sourceScope: "debary",
          sourceListingId: "9001",
          canonicalListingUrl: UNIT_A,
          stockNumber: "9001",
          vin: mappedVin,
          year: 2019,
          makeModel: "Freightliner M2",
          boxLengthFt: 26,
          boxLengthRaw: "26",
          engine: "Cummins",
          engineIsCummins: true,
          transmission: "Allison",
          transmissionIsAutomatic: true,
          listedWeightLbs: null,
          listedWeightTerm: "unknown",
          manufacturerGvwrLbs: 26000,
          gvwrDoorPlateVerified: false,
          mileage: 120000,
          hasLiftgate: true,
          liftgateNotes: "",
          price: 45000,
          location: "Joplin, MO",
          drivingDistanceMiles: 10,
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
          specEvidence: {},
        } as import("@/types/sourcing").TruckLead,
      ],
      fetchImpl: createMockValidateFetchImpl(),
    });

    expect(second.trucks.every((t) => t.vin !== mappedVin)).toBe(true);
    expect(second.rejected.some((r) => /already in skl/i.test(r.reason))).toBe(true);
  });
});

describe("Preview deadline / caps", () => {
  it("returns partial Preview when deadline is already elapsed", async () => {
    const preview = await runDiscoveryInspectPreview({
      mode: "mock",
      confirmPaidProviders: true,
      tavilyClient: createMockDiscoveryInspectSearchClient(),
      validateFetchImpl: createMockValidateFetchImpl(),
      previewDeadlineMs: 0,
    });
    expect(preview.dbWrites).toBe(false);
    expect(preview.notes.some((n) => /partial preview|deadline/i.test(n))).toBe(true);
  });

  it("keeps usage.live true for live mode Preview", async () => {
    const preview = await runDiscoveryInspectPreview({
      mode: "live",
      confirmPaidProviders: true,
      allowLiveNetwork: false,
      tavilyClient: createMockDiscoveryInspectSearchClient(),
      validateFetchImpl: createMockValidateFetchImpl(),
    });
    expect(preview.usage.live).toBe(true);
    expect(preview.dbWrites).toBe(false);
  });
});
