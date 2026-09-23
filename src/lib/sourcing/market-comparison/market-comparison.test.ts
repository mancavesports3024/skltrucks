import { describe, expect, it, vi } from "vitest";
import {
  assessMarketDeal,
  hasMaterialComparabilityProblem,
  resolveConfidence,
} from "@/lib/sourcing/market-comparison/assessment";
import {
  buildMarketComparisonReport,
  recalculateReportWithLandedCosts,
} from "@/lib/sourcing/market-comparison/build-report";
import {
  isLeadEligibleForMarketComparison,
  missingRequiredLeadFields,
} from "@/lib/sourcing/market-comparison/eligibility";
import { emptyFieldEvidence } from "@/lib/sourcing/market-comparison/evidence";
import { calculateLandedCost, hasExpenseInputs } from "@/lib/sourcing/market-comparison/landed-cost";
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
import {
  MARKET_COMPARISON_ASKING_PRICE_BASIS,
  MARKET_COMPARISON_MAX_EXPECTED_COST_USD,
  MARKET_COMPARISON_MAX_TOOL_CALLS,
  MARKET_COMPARISON_PURCHASE_PRICE_ONLY_LABEL,
  MARKET_COMPARISON_TARGET_VERIFIED_MAX,
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
  const year = over.year ?? 2019;
  const makeModel = over.makeModel ?? "Freightliner M2";
  const mileage = over.mileage ?? 145000;
  const askingPrice = over.askingPrice === undefined ? 45000 : over.askingPrice;
  const listingUrl =
    over.listingUrl ??
    "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-26ft-9001";
  const uniqueSuffix = listingUrl.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase() || "DEFAULT";
  const base: ComparableListingRaw = {
    listingUrl,
    sourceName: "Dealer",
    year,
    makeModel,
    mileage,
    askingPrice,
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
    evidenceNotes: "Inspected unit page",
    vin: `1FVACWDT0KH${uniqueSuffix}`.slice(0, 17),
    stockNumber: `ST-${uniqueSuffix}`,
    listingPageInspected: true,
    fieldEvidence: emptyFieldEvidence({
      askingPrice:
        askingPrice != null
          ? `Asking price $${askingPrice.toLocaleString("en-US")} on unit page`
          : "No asking price",
      year: `Model year ${year} on unit page`,
      makeModel: `${makeModel} listed on unit page`,
      mileage:
        mileage != null
          ? `Odometer ${mileage.toLocaleString("en-US")} miles on unit page`
          : "Mileage not shown",
    }),
  };
  return { ...base, ...over, fieldEvidence: over.fieldEvidence ?? base.fieldEvidence };
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
      canonicalizeComparableUrl("https://Example.com/inventory/unit-1/?utm_source=x#frag")
    ).toBe("https://example.com/inventory/unit-1");
  });
});

describe("comparable exclusions", () => {
  it("excludes auction without asking, salvage, reefer, manual, overweight, cab/chassis", () => {
    expect(
      detectComparableExclusion(
        listing({
          askingPrice: null,
          auctionCurrentBid: 20000,
          statusNotes: "Auction current bid",
          fieldEvidence: emptyFieldEvidence({
            askingPrice: "auction only",
            year: "2019",
            makeModel: "Freightliner M2",
            mileage: "145000",
          }),
        })
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

  it("rejects search snippet without inspected listing evidence", () => {
    expect(
      detectComparableExclusion(
        listing({
          listingPageInspected: false,
          fieldEvidence: emptyFieldEvidence(),
        })
      )
    ).toBe("unverified_listing_evidence");
  });

  it("rejects URL/price mismatch against field evidence", () => {
    expect(
      detectComparableExclusion(
        listing({
          askingPrice: 45000,
          fieldEvidence: emptyFieldEvidence({
            askingPrice: "Asking price $38,000 on unit page",
            year: "Model year 2019",
            makeModel: "Freightliner M2",
            mileage: "145000 miles",
          }),
        })
      )
    ).toBe("field_evidence_mismatch");
  });

  it("rejects unsupported mileage evidence", () => {
    expect(
      detectComparableExclusion(
        listing({
          mileage: 145000,
          fieldEvidence: emptyFieldEvidence({
            askingPrice: "Asking $45,000",
            year: "2019",
            makeModel: "Freightliner M2",
            mileage: "mileage not listed",
          }),
        })
      )
    ).toBe("field_evidence_mismatch");
  });

  it("rejects hub/redirect-style category URLs", () => {
    expect(
      detectComparableExclusion(
        listing({ listingUrl: "https://www.commercialtrucktrader.com/box-trucks-for-sale" })
      )
    ).toBe("invalid_or_hub_url");
  });

  it("dedupes the same truck across marketplaces by VIN", () => {
    const a = listing({
      listingUrl: "https://www.debarytrucksales.com/inventory/used-a-vin",
      vin: "1FVACWDT0KHMA7777",
      stockNumber: "A-1",
    });
    const b = listing({
      listingUrl: "https://www.truckpaper.com/listings/detail/used-b-vin",
      vin: "1FVACWDT0KHMA7777",
      stockNumber: "TP-9",
      askingPrice: 44000,
      fieldEvidence: emptyFieldEvidence({
        askingPrice: "Asking price $44,000 on unit page",
        year: "Model year 2019 on unit page",
        makeModel: "Freightliner M2 listed on unit page",
        mileage: "Odometer 145,000 miles on unit page",
      }),
    });
    const { usable, excluded } = scoreComparables(lead(), [a, b]);
    expect(usable.length).toBe(1);
    expect(excluded.some((e) => e.exclusionReason === "duplicate_vehicle")).toBe(true);
  });
});

describe("price + landed cost", () => {
  it("computes median and percentage vs lead", () => {
    expect(medianNumber([1, 3, 2])).toBe(2);
    expect(medianNumber([1, 2, 3, 4])).toBe(2.5);
    const scored = scoreComparables(lead({ price: 40000 }), [
      listing({ askingPrice: 42000, listingUrl: "https://www.debarytrucksales.com/inventory/u1", vin: "V1", fieldEvidence: emptyFieldEvidence({ askingPrice: "Asking price $42,000 on unit page", year: "Model year 2019 on unit page", makeModel: "Freightliner M2 listed", mileage: "Odometer 145,000 miles on unit page" }) }),
      listing({ askingPrice: 44000, listingUrl: "https://www.debarytrucksales.com/inventory/u2", vin: "V2", fieldEvidence: emptyFieldEvidence({ askingPrice: "Asking price $44,000 on unit page", year: "Model year 2019 on unit page", makeModel: "Freightliner M2 listed", mileage: "Odometer 145,000 miles on unit page" }) }),
      listing({ askingPrice: 46000, listingUrl: "https://www.debarytrucksales.com/inventory/u3", vin: "V3", fieldEvidence: emptyFieldEvidence({ askingPrice: "Asking price $46,000 on unit page", year: "Model year 2019 on unit page", makeModel: "Freightliner M2 listed", mileage: "Odometer 145,000 miles on unit page" }) }),
    ]).usable;
    const summary = buildPriceSummary(40000, scored);
    expect(summary.usableCount).toBe(3);
    expect(summary.medianAsking).toBe(44000);
    expect(summary.dollarDiffFromMedian).toBe(-4000);
    expect(summary.pctDiffFromMedian).toBe(-9.1);
  });

  it("calculates landed cost and break-even without inventing profit", () => {
    const lc = calculateLandedCost(
      40000,
      {
        transportation: 1500,
        inspection: 400,
        repairs: 1000,
        fees: 200,
        otherCosts: 100,
        desiredGrossMargin: 5000,
      },
      45000
    );
    expect(lc.estimatedLandedCost).toBe(43200);
    expect(lc.landedVsMedian).toBe(43200 - 45000);
    expect(lc.approximateGrossMarginOpportunity).toBe(45000 - 43200);
    expect(lc.breakEvenResalePrice).toBe(43200 + 5000);
    expect(lc.expensesIncluded).toBe(true);
    expect(hasExpenseInputs({ transportation: 1500 })).toBe(true);
    expect(hasExpenseInputs({})).toBe(false);
  });
});

describe("confidence and assessment", () => {
  it("marks insufficient evidence below 3 usable comparables", () => {
    const usable = scoreComparables(lead(), [
      listing({ listingUrl: "https://www.debarytrucksales.com/inventory/u1", vin: "A1" }),
      listing({ listingUrl: "https://www.debarytrucksales.com/inventory/u2", vin: "A2" }),
    ]).usable;
    const result = assessMarketDeal({
      assessmentBasisAmount: 40000,
      assessmentBasisKind: "purchase_price",
      expensesIncluded: false,
      medianAsking: buildPriceSummary(40000, usable).medianAsking,
      usable,
      missingPreferredCount: 0,
    });
    expect(result.assessment).toBe("insufficient_evidence");
    expect(result.reasons.some((r) => /Based on public asking prices/i.test(r))).toBe(true);
  });

  it("caps confidence by usable count", () => {
    expect(resolveConfidence({ usableCount: 3, missingPreferredCount: 0, usable: [] })).toBe("low");
    expect(resolveConfidence({ usableCount: 5, missingPreferredCount: 0, usable: [] })).toBe(
      "medium"
    );
    expect(resolveConfidence({ usableCount: 8, missingPreferredCount: 0, usable: [] })).toBe("high");
  });

  it("follows deterministic precedence: strong / near / weak from assessment basis", () => {
    const comps = [42000, 44000, 46000, 45000, 43000].map((askingPrice, i) =>
      listing({
        askingPrice,
        listingUrl: `https://www.debarytrucksales.com/inventory/band-${i}`,
        vin: `VINBAND${i}`,
        fieldEvidence: emptyFieldEvidence({
          askingPrice: `Asking price $${askingPrice.toLocaleString("en-US")} on unit page`,
          year: "Model year 2019 on unit page",
          makeModel: "Freightliner M2 listed on unit page",
          mileage: "Odometer 145,000 miles on unit page",
        }),
      })
    );
    const usable = scoreComparables(lead({ price: 38000 }), comps).usable;
    expect(usable.length).toBeGreaterThanOrEqual(5);
    const median = buildPriceSummary(38000, usable).medianAsking!;

    const strong = assessMarketDeal({
      assessmentBasisAmount: 38000,
      assessmentBasisKind: "purchase_price",
      expensesIncluded: false,
      medianAsking: median,
      usable,
      missingPreferredCount: 0,
    });
    expect(strong.assessment).toBe("potentially_strong_deal");

    const near = assessMarketDeal({
      assessmentBasisAmount: 44000,
      assessmentBasisKind: "purchase_price",
      expensesIncluded: false,
      medianAsking: median,
      usable,
      missingPreferredCount: 0,
    });
    expect(near.assessment).toBe("near_comparable_asking_market");

    const weak = assessMarketDeal({
      assessmentBasisAmount: 52000,
      assessmentBasisKind: "purchase_price",
      expensesIncluded: false,
      medianAsking: median,
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
        vin: `VINLOW${i}`,
        fieldEvidence: emptyFieldEvidence({
          askingPrice: `Asking price $${askingPrice.toLocaleString("en-US")} on unit page`,
          year: "Model year 2019 on unit page",
          makeModel: "Freightliner M2 listed on unit page",
          mileage: "Odometer 145,000 miles on unit page",
        }),
      })
    );
    const usable = scoreComparables(lead({ price: 30000 }), comps).usable;
    const result = assessMarketDeal({
      assessmentBasisAmount: 30000,
      assessmentBasisKind: "purchase_price",
      expensesIncluded: false,
      medianAsking: buildPriceSummary(30000, usable).medianAsking,
      usable,
      missingPreferredCount: 0,
    });
    expect(result.confidence).toBe("low");
    expect(result.assessment).not.toBe("potentially_strong_deal");
    expect(result.assessment).toBe("near_comparable_asking_market");
  });

  it("uses insufficient evidence for material comparability problems", () => {
    const forced = [
      {
        listing: listing({ makeModel: "Freightliner M2", vin: "W1" }),
        usable: true,
        matchScore: 40,
        includeReasons: ["Same or equivalent make/model"],
        differenceNotes: ["GVWR differs materially", "Box length 16' vs lead 26'"],
        canonicalUrl: "https://a/1",
      },
      {
        listing: listing({ makeModel: "Freightliner M2", vin: "W2" }),
        usable: true,
        matchScore: 42,
        includeReasons: ["Same or equivalent make/model"],
        differenceNotes: ["Model differs (edge)", "Engine is not Cummins"],
        canonicalUrl: "https://a/2",
      },
      {
        listing: listing({ makeModel: "Freightliner M2", vin: "W3" }),
        usable: true,
        matchScore: 41,
        includeReasons: ["Same or equivalent make/model"],
        differenceNotes: ["Box length 18' vs lead 26'"],
        canonicalUrl: "https://a/3",
      },
    ];
    expect(hasMaterialComparabilityProblem(forced)).toBe(true);
    const result = assessMarketDeal({
      assessmentBasisAmount: 30000,
      assessmentBasisKind: "purchase_price",
      expensesIncluded: false,
      medianAsking: 45000,
      usable: forced,
      missingPreferredCount: 0,
    });
    expect(result.assessment).toBe("insufficient_evidence");
  });

  it("expenses can downgrade strong → near and near → weak", () => {
    const comps = [42000, 44000, 46000, 45000, 43000].map((askingPrice, i) =>
      listing({
        askingPrice,
        listingUrl: `https://www.debarytrucksales.com/inventory/exp-${i}`,
        vin: `VINEXP${i}`,
        fieldEvidence: emptyFieldEvidence({
          askingPrice: `Asking price $${askingPrice.toLocaleString("en-US")} on unit page`,
          year: "Model year 2019 on unit page",
          makeModel: "Freightliner M2 listed on unit page",
          mileage: "Odometer 145,000 miles on unit page",
        }),
      })
    );
    const subject = lead({ price: 38000 });
    const withoutExpenses = buildMarketComparisonReport({
      lead: subject,
      listings: comps,
      apiUsage: mockMarketComparisonUsage(),
      provider: "mock",
    });
    expect(withoutExpenses.assessment).toBe("potentially_strong_deal");
    expect(withoutExpenses.purchasePriceOnlyLabel).toBe(MARKET_COMPARISON_PURCHASE_PRICE_ONLY_LABEL);

    const strongToNear = recalculateReportWithLandedCosts(withoutExpenses, {
      transportation: 8000,
      inspection: 0,
      repairs: 0,
      fees: 0,
      otherCosts: 0,
      desiredGrossMargin: 0,
    });
    // 38000 + 8000 = 46000 vs median ~44000 → near or weak depending on exact median
    expect(strongToNear.expensesIncluded).toBe(true);
    expect(strongToNear.assessmentBasisKind).toBe("landed_cost");
    expect(strongToNear.assessment).not.toBe("potentially_strong_deal");
    expect(["near_comparable_asking_market", "potentially_weak_deal"]).toContain(
      strongToNear.assessment
    );

    const nearBase = buildMarketComparisonReport({
      lead: lead({ price: 44000 }),
      listings: comps,
      apiUsage: mockMarketComparisonUsage(),
      provider: "mock",
    });
    expect(nearBase.assessment).toBe("near_comparable_asking_market");
    const nearToWeak = recalculateReportWithLandedCosts(nearBase, {
      transportation: 5000,
      inspection: 1000,
      repairs: 0,
      fees: 0,
      otherCosts: 0,
      desiredGrossMargin: 0,
    });
    expect(nearToWeak.assessment).toBe("potentially_weak_deal");
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
    expect(report.usableComparables.length).toBeLessThanOrEqual(MARKET_COMPARISON_TARGET_VERIFIED_MAX);
    for (const c of report.usableComparables) {
      expect(c.listing.listingUrl).toMatch(/^https:\/\//);
      expect(isIndividualListingUrl(c.listing.listingUrl)).toBe(true);
      expect(c.listing.askingPrice).toBeGreaterThan(0);
      expect(c.listing.listingPageInspected).toBe(true);
    }
    expect(report.apiUsage.live).toBe(false);
    expect(report.disclaimer).toMatch(/public asking prices/i);
    expect(report.askingPriceBasisNotice).toBe(MARKET_COMPARISON_ASKING_PRICE_BASIS);
  });

  it("corrected mock: purchase strong-looking, landed near market", () => {
    const subject = lead({ price: 40000 });
    const withExpenses = buildMarketComparisonReport({
      lead: subject,
      listings: mockComparableListings(subject),
      apiUsage: mockMarketComparisonUsage(),
      provider: "mock",
      landedCostInput: {
        transportation: 1500,
        inspection: 400,
        repairs: 800,
        fees: 200,
        otherCosts: 100,
        desiredGrossMargin: 5000,
      },
    });
    expect(withExpenses.priceSummary?.medianAsking).toBe(44500);
    expect(withExpenses.purchasePriceVsMedian?.pctDiffFromMedian).toBe(-10.1);
    expect(withExpenses.landedCost?.estimatedLandedCost).toBe(43000);
    expect(withExpenses.landedCostVsMedian?.pctDiffFromMedian).toBeCloseTo(-3.4, 1);
    expect(withExpenses.assessmentBasisKind).toBe("landed_cost");
    expect(withExpenses.assessment).toBe("near_comparable_asking_market");
    expect(withExpenses.assessmentLabel).toBe("Near comparable asking market");
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

  it("parses valid comparable JSON including evidence fields", () => {
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
            vin: "ABC",
            stockNumber: "1",
            listingPageInspected: true,
            fieldEvidence: {
              askingPrice: "Asking $42,000",
              year: "2019",
              makeModel: "Freightliner M2",
              mileage: "100000 miles",
            },
          },
        ],
      })
    );
    expect(parsed.parseError).toBeUndefined();
    expect(parsed.listings).toHaveLength(1);
    expect(parsed.listings[0].listingPageInspected).toBe(true);
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

describe("cost ceiling honesty", () => {
  it("documents a tool-call ceiling that can support verifying a few listings", () => {
    expect(MARKET_COMPARISON_MAX_TOOL_CALLS).toBeGreaterThanOrEqual(12);
    expect(MARKET_COMPARISON_TARGET_VERIFIED_MAX).toBeLessThanOrEqual(6);
    expect(MARKET_COMPARISON_MAX_EXPECTED_COST_USD).toBeGreaterThanOrEqual(0.25);
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

vi.stubGlobal("fetch", vi.fn(() => {
  throw new Error("network should not be called in market comparison unit tests");
}));
