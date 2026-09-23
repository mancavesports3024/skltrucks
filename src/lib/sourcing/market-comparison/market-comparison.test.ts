import { describe, expect, it, vi } from "vitest";
import { assessMarketDeal, resolveConfidence } from "@/lib/sourcing/market-comparison/assessment";
import { buildMarketComparisonReport } from "@/lib/sourcing/market-comparison/build-report";
import {
  isLeadEligibleForMarketComparison,
  missingRequiredLeadFields,
} from "@/lib/sourcing/market-comparison/eligibility";
import { calculateLandedCost } from "@/lib/sourcing/market-comparison/landed-cost";
import { mockComparableListings, mockMarketComparisonUsage } from "@/lib/sourcing/market-comparison/mock";
import { buildPriceSummary, medianNumber } from "@/lib/sourcing/market-comparison/price-analysis";
import { parseComparableListingsJson } from "@/lib/sourcing/market-comparison/provider";
import {
  canonicalizeComparableUrl,
  detectComparableExclusion,
  scoreComparables,
} from "@/lib/sourcing/market-comparison/scoring";
import type {
  ComparableListingRaw,
  LeadComparisonSnapshot,
} from "@/lib/sourcing/market-comparison/types";
import { isIndividualListingUrl } from "@/lib/sourcing/search/map-candidates";
import { createMemorySearchLockStore } from "@/lib/sourcing/search/search-lock";

function lead(over: Partial<LeadComparisonSnapshot> = {}): LeadComparisonSnapshot {
  return {
    id: "lead-1",
    year: 2019,
    makeModel: "Freightliner M2",
    mileage: 140000,
    price: 40000,
    boxLengthFt: 26,
    engine: "Cummins ISB",
    engineIsCummins: true,
    transmission: "Allison",
    transmissionIsAutomatic: true,
    manufacturerGvwrLbs: 25500,
    listedWeightLbs: null,
    hasLiftgate: true,
    location: "Joplin, MO",
    ...over,
  };
}

function listing(over: Partial<ComparableListingRaw> = {}): ComparableListingRaw {
  return {
    listingUrl: "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-26ft-9001",
    sourceName: "Dealer",
    year: 2019,
    makeModel: "Freightliner M2",
    mileage: 145000,
    askingPrice: 45000,
    auctionCurrentBid: null,
    boxLengthFt: 26,
    bodyType: "dry van",
    engine: "Cummins",
    engineIsCummins: true,
    transmission: "Automatic",
    transmissionIsAutomatic: true,
    manufacturerGvwrLbs: 25500,
    hasLiftgate: true,
    location: "Sanford, FL",
    conditionNotes: "",
    statusNotes: "",
    evidenceNotes: "unit page",
    ...over,
  };
}

describe("eligibility", () => {
  it("requires year, make/model, mileage, and price", () => {
    expect(missingRequiredLeadFields(lead({ year: null }))).toContain("Year");
    expect(missingRequiredLeadFields(lead({ makeModel: "" }))).toContain("Make/model");
    expect(missingRequiredLeadFields(lead({ mileage: null }))).toContain("Mileage");
    expect(missingRequiredLeadFields(lead({ price: null }))).toContain("Asking/wholesale price");
    expect(isLeadEligibleForMarketComparison(lead())).toBe(true);
    expect(isLeadEligibleForMarketComparison(lead({ price: null }))).toBe(false);
  });
});

describe("URL validation for comparables", () => {
  it("accepts individual listing URLs and rejects hubs", () => {
    expect(
      isIndividualListingUrl(
        "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-26ft-9001"
      )
    ).toBe(true);
    expect(isIndividualListingUrl("https://www.commercialtrucktrader.com/box-trucks-for-sale")).toBe(
      false
    );
    expect(isIndividualListingUrl("https://www.penskeusedtrucks.com/search-inventory/")).toBe(false);
  });

  it("dedupes by canonical URL", () => {
    expect(
      canonicalizeComparableUrl(
        "https://Example.com/inventory/unit-1/?utm_source=x#frag"
      )
    ).toBe("https://example.com/inventory/unit-1");
  });
});

describe("comparable exclusions", () => {
  it("excludes auction without asking, salvage, reefer, manual, overweight, cab/chassis", () => {
    expect(
      detectComparableExclusion(
        listing({ askingPrice: null, auctionCurrentBid: 20000, statusNotes: "Auction current bid" })
      )
    ).toBe("auction_without_asking_price");
    expect(detectComparableExclusion(listing({ conditionNotes: "salvage title" }))).toBe(
      "salvage_or_damaged"
    );
    expect(detectComparableExclusion(listing({ bodyType: "reefer van" }))).toBe("reefer");
    expect(
      detectComparableExclusion(listing({ transmissionIsAutomatic: false, transmission: "Manual" }))
    ).toBe("manual_transmission");
    expect(detectComparableExclusion(listing({ manufacturerGvwrLbs: 33000 }))).toBe("over_max_gvwr");
    expect(
      detectComparableExclusion(listing({ bodyType: "cab chassis", boxLengthFt: null }))
    ).toBe("cab_chassis_without_box");
    expect(detectComparableExclusion(listing({ askingPrice: null, mileage: 100000 }))).toBe(
      "missing_asking_price"
    );
    expect(detectComparableExclusion(listing({ mileage: null }))).toBe("missing_mileage");
  });

  it("excludes duplicate URLs without failing the batch", () => {
    const a = listing({ listingUrl: "https://www.debarytrucksales.com/inventory/used-a-1" });
    const dup = listing({ listingUrl: "https://www.debarytrucksales.com/inventory/used-a-1?utm=1" });
    const { usable, excluded } = scoreComparables(lead(), [a, dup]);
    expect(usable.length).toBe(1);
    expect(excluded.some((e) => e.exclusionReason === "duplicate_url")).toBe(true);
  });
});

describe("price + landed cost", () => {
  it("computes median and percentage vs lead", () => {
    expect(medianNumber([1, 3, 2])).toBe(2);
    expect(medianNumber([1, 2, 3, 4])).toBe(2.5);
    const scored = scoreComparables(lead({ price: 40000 }), [
      listing({ askingPrice: 42000, listingUrl: "https://www.debarytrucksales.com/inventory/u1" }),
      listing({ askingPrice: 44000, listingUrl: "https://www.debarytrucksales.com/inventory/u2" }),
      listing({ askingPrice: 46000, listingUrl: "https://www.debarytrucksales.com/inventory/u3" }),
    ]).usable;
    const summary = buildPriceSummary(40000, scored);
    expect(summary.usableCount).toBe(3);
    expect(summary.medianAsking).toBe(44000);
    expect(summary.dollarDiffFromMedian).toBe(-4000);
    expect(summary.pctDiffFromMedian).toBe(-9.1);
  });

  it("calculates landed cost and break-even without inventing profit", () => {
    const lc = calculateLandedCost(40000, {
      transportation: 1500,
      inspection: 400,
      repairs: 1000,
      fees: 200,
      otherCosts: 100,
      desiredGrossMargin: 5000,
    }, 45000);
    expect(lc.estimatedLandedCost).toBe(43200);
    expect(lc.landedVsMedian).toBe(43200 - 45000);
    expect(lc.approximateGrossMarginOpportunity).toBe(45000 - 43200);
    expect(lc.breakEvenResalePrice).toBe(43200 + 5000);
  });
});

describe("confidence and assessment", () => {
  it("marks insufficient evidence below 3 usable comparables", () => {
    const usable = scoreComparables(lead(), [
      listing({ listingUrl: "https://www.debarytrucksales.com/inventory/u1" }),
      listing({ listingUrl: "https://www.debarytrucksales.com/inventory/u2" }),
    ]).usable;
    const result = assessMarketDeal({
      priceSummary: buildPriceSummary(40000, usable),
      usable,
      missingPreferredCount: 0,
    });
    expect(result.assessment).toBe("insufficient_evidence");
  });

  it("caps confidence by usable count", () => {
    expect(resolveConfidence({ usableCount: 3, missingPreferredCount: 0, usable: [] })).toBe("low");
    expect(resolveConfidence({ usableCount: 5, missingPreferredCount: 0, usable: [] })).toBe(
      "medium"
    );
    expect(resolveConfidence({ usableCount: 8, missingPreferredCount: 0, usable: [] })).toBe("high");
  });

  it("labels strong / near / weak from median bands", () => {
    const comps = [42000, 44000, 46000, 45000, 43000].map((askingPrice, i) =>
      listing({
        askingPrice,
        listingUrl: `https://www.debarytrucksales.com/inventory/band-${i}`,
      })
    );
    const usable = scoreComparables(lead({ price: 38000 }), comps).usable;
    expect(usable.length).toBeGreaterThanOrEqual(5);
    const strong = assessMarketDeal({
      priceSummary: buildPriceSummary(38000, usable),
      usable,
      missingPreferredCount: 0,
    });
    expect(strong.assessment).toBe("potentially_strong_deal");

    const near = assessMarketDeal({
      priceSummary: buildPriceSummary(44000, usable),
      usable,
      missingPreferredCount: 0,
    });
    expect(near.assessment).toBe("near_comparable_asking_market");

    const weak = assessMarketDeal({
      priceSummary: buildPriceSummary(52000, usable),
      usable,
      missingPreferredCount: 0,
    });
    expect(weak.assessment).toBe("potentially_weak_deal");
  });

  it("does not call strong deal when confidence is low", () => {
    const comps = [45000, 46000, 47000].map((askingPrice, i) =>
      listing({
        askingPrice,
        listingUrl: `https://www.debarytrucksales.com/inventory/lowc-${i}`,
      })
    );
    const usable = scoreComparables(lead({ price: 30000 }), comps).usable;
    const result = assessMarketDeal({
      priceSummary: buildPriceSummary(30000, usable),
      usable,
      missingPreferredCount: 0,
    });
    expect(result.confidence).toBe("low");
    expect(result.assessment).not.toBe("potentially_strong_deal");
  });
});

describe("build report + mock listings", () => {
  it("keeps every usable price traceable to an individual listing URL", () => {
    const subject = lead({ price: 40000 });
    const report = buildMarketComparisonReport({
      lead: subject,
      listings: mockComparableListings(subject),
      apiUsage: mockMarketComparisonUsage(),
      provider: "mock",
    });
    expect(report.usableComparables.length).toBeGreaterThanOrEqual(3);
    for (const c of report.usableComparables) {
      expect(c.listing.listingUrl).toMatch(/^https:\/\//);
      expect(isIndividualListingUrl(c.listing.listingUrl)).toBe(true);
      expect(c.listing.askingPrice).toBeGreaterThan(0);
    }
    expect(report.apiUsage.live).toBe(false);
    expect(report.disclaimer).toMatch(/public asking prices/i);
  });

  it("does not invent lead field changes", () => {
    const subject = lead({ price: 40000, mileage: 140000 });
    const report = buildMarketComparisonReport({
      lead: subject,
      listings: mockComparableListings(subject),
      apiUsage: mockMarketComparisonUsage(),
    });
    expect(report.priceSummary?.leadPrice).toBe(40000);
    expect(report.landedCost?.truckPrice).toBe(40000);
  });
});

describe("provider structured output parsing", () => {
  it("reports invalid JSON without creating a successful valuation payload", () => {
    const parsed = parseComparableListingsJson("{ not json");
    expect(parsed.parseError).toBeTruthy();
    expect(parsed.listings).toEqual([]);
  });

  it("parses valid comparable JSON", () => {
    const parsed = parseComparableListingsJson(
      JSON.stringify({
        queriesUsed: ["freightliner m2 26"],
        sourcesConsulted: ["commercialtrucktrader.com"],
        notes: "ok",
        comparables: [
          {
            listingUrl: "https://www.debarytrucksales.com/inventory/used-x-1",
            sourceName: "Dealer",
            year: 2019,
            makeModel: "Freightliner M2",
            mileage: 100000,
            askingPrice: 42000,
            auctionCurrentBid: null,
            boxLengthFt: 26,
            bodyType: "dry van",
            engine: "Cummins",
            engineIsCummins: true,
            transmission: "Auto",
            transmissionIsAutomatic: true,
            manufacturerGvwrLbs: 25500,
            hasLiftgate: true,
            location: "FL",
            conditionNotes: "",
            statusNotes: "",
            evidenceNotes: "",
          },
        ],
      })
    );
    expect(parsed.parseError).toBeUndefined();
    expect(parsed.listings).toHaveLength(1);
  });
});

describe("duplicate-click lock", () => {
  it("blocks a second acquire while the first holder is active", async () => {
    const lock = createMemorySearchLockStore();
    const first = await lock.tryAcquire("a@example.com");
    expect(first.ok).toBe(true);
    const second = await lock.tryAcquire("b@example.com");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("already_running");
    await lock.release("a@example.com");
    const third = await lock.tryAcquire("b@example.com");
    expect(third.ok).toBe(true);
  });
});

describe("pending button accessibility copy", () => {
  it("exports pending label for comparing state", async () => {
    const { MARKET_COMPARISON_PENDING_LABEL } = await import(
      "@/lib/sourcing/market-comparison/types"
    );
    expect(MARKET_COMPARISON_PENDING_LABEL).toMatch(/Comparing current market listings/i);
  });
});

// Keep fetch from being called in this suite
vi.stubGlobal("fetch", vi.fn(() => {
  throw new Error("network should not be called in market comparison unit tests");
}));
