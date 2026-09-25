import { describe, expect, it, vi } from "vitest";
import {
  AMBIGUOUS_UNIT_FIXTURES,
  FIRST_RUN_RETAINED_URL_FIXTURES,
  PROVEN_UNIT_VDP_FIXTURES,
  buildDiscoveryBenchmarkPreflight,
  buildDiscoveryQueryMatrix,
  classifyDiscoveryUrl,
  createMockDiscoverySearchClient,
  discoveryQueriesAreRelaxed,
  discoveryQueriesPreferUnitPages,
  evaluateDiscoveryBenchmarkSuccess,
  listKnownDiscoveryDomains,
  runDiscoveryBenchmark,
  DISCOVERY_BENCHMARK_SUCCESS_THRESHOLD,
} from "@/lib/sourcing/search/discovery-benchmark";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";
import { classifyLead } from "@/lib/sourcing/match";

describe("discovery query matrix", () => {
  it("builds ≤12 unit-oriented relaxed queries from the buying profile", () => {
    const plans = buildDiscoveryQueryMatrix(DEFAULT_BUYING_PROFILE, {
      maxQueries: 12,
      asOf: new Date("2026-09-24"),
    });
    expect(plans.length).toBeGreaterThanOrEqual(10);
    expect(plans.length).toBeLessThanOrEqual(12);
    expect(plans.some((p) => /Freightliner M2 106/i.test(p.query) && /VIN/i.test(p.query))).toBe(
      true
    );
    expect(plans.some((p) => /International MV/i.test(p.query) && /VIN/i.test(p.query))).toBe(
      true
    );
    expect(plans.some((p) => /Kenworth T270/i.test(p.query) && /Stock/i.test(p.query))).toBe(
      true
    );
    expect(plans.some((p) => /26 foot box truck/i.test(p.query))).toBe(true);
    expect(plans.some((p) => /Cummins/i.test(p.query) && /Allison/i.test(p.query))).toBe(true);
    expect(plans.some((p) => p.purpose === "year_model")).toBe(true);
    expect(plans.some((p) => p.purpose === "domain_targeted" && p.includeDomains?.length)).toBe(
      true
    );
    expect(discoveryQueriesAreRelaxed(plans)).toBe(true);
    expect(discoveryQueriesPreferUnitPages(plans)).toBe(true);
    // Deprioritize bare category bait / eBay / SOARR
    expect(plans.every((p) => !/ebay|soarr/i.test(p.query))).toBe(true);
    expect(
      plans.every(
        (p) =>
          !p.includeDomains?.some((d) => /ebay\.com|soarr\.com|cummins\.com/i.test(d))
      )
    ).toBe(true);
  });

  it("does not force GVWR/mileage/liftgate/1200 into every discovery query", () => {
    const plans = buildDiscoveryQueryMatrix(DEFAULT_BUYING_PROFILE);
    const forced = plans.filter((p) =>
      /gvwr|26,?000|275,?000|liftgate|1,?200/i.test(p.query)
    );
    expect(forced.length).toBeLessThan(plans.length / 2);
  });

  it("keeps U.S.-only as an inspection/classification rule, not a discovery query term", () => {
    const plans = buildDiscoveryQueryMatrix(DEFAULT_BUYING_PROFILE);
    const withUsForced = plans.filter((p) =>
      /\bunited states\b|\bu\.s\.a?\b|\busa\b/i.test(p.query)
    );
    expect(withUsForced.length).toBe(0);
  });

  it("reuses known in-repo dealer domains for optional targeting", () => {
    const domains = listKnownDiscoveryDomains();
    expect(domains).toContain("penskeusedtrucks.com");
    expect(domains).toContain("debarytrucksales.com");
  });
});

describe("discovery URL classification — first-run false positives", () => {
  it("classifies every live-run-1 retained URL shape as hub_or_category", () => {
    expect(FIRST_RUN_RETAINED_URL_FIXTURES).toHaveLength(20);
    for (const fixture of FIRST_RUN_RETAINED_URL_FIXTURES) {
      const c = classifyDiscoveryUrl(fixture.url);
      expect(c.bucket, fixture.id).toBe(fixture.expectedBucket);
      expect(c.bucket).not.toBe("individual_listing");
    }
  });

  it("keeps proven unit VDP fixtures as individual_listing", () => {
    for (const fixture of PROVEN_UNIT_VDP_FIXTURES) {
      const c = classifyDiscoveryUrl(fixture.url);
      expect(c.bucket, fixture.id).toBe("individual_listing");
    }
  });

  it("routes ambiguous unit-shaped paths to likely_listing_needs_inspection", () => {
    for (const fixture of AMBIGUOUS_UNIT_FIXTURES) {
      const c = classifyDiscoveryUrl(fixture.url);
      expect(c.bucket, fixture.id).toBe("likely_listing_needs_inspection");
    }
  });

  it("rejects unsafe/session URLs", () => {
    expect(
      classifyDiscoveryUrl("https://dealer.example/listing?session=abc&token=x").bucket
    ).toBe("unsupported_or_unsafe");
    expect(
      classifyDiscoveryUrl("https://user:pass@dealer.example/inventory/unit-9001").bucket
    ).toBe("unsupported_or_unsafe");
    expect(classifyDiscoveryUrl("https://dealer.example/x#secret-fragment").bucket).toBe(
      "unsupported_or_unsafe"
    );
  });

  it("canonicalizes and rejects TruckPaper /listings per existing gate", () => {
    const c = classifyDiscoveryUrl(
      "https://www.truckpaper.com/listings/detail/123456?utm_source=x"
    );
    expect(c.bucket).toBe("unsupported_or_unsafe");
  });

  it("dedupes via canonical URL (strips tracking params)", () => {
    const a = classifyDiscoveryUrl(
      "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001?utm_source=tavily"
    );
    const b = classifyDiscoveryUrl(
      "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001"
    );
    expect(a.canonicalUrl).toBe(b.canonicalUrl);
    expect(a.bucket).toBe("individual_listing");
  });
});

describe("offline first-run retention regression", () => {
  it("first-run false positives no longer fill the 20-URL retention cap", async () => {
    const firstRunHubs = FIRST_RUN_RETAINED_URL_FIXTURES.map((f) => f.url);
    const units = PROVEN_UNIT_VDP_FIXTURES.map((f) => f.url);
    let call = 0;
    const client = {
      async search() {
        call += 1;
        // First query: all 20 hub false positives + a few units
        if (call === 1) {
          return {
            results: [
              ...firstRunHubs.map((url) => ({ url, title: "hub" })),
              ...units.map((url) => ({ url, title: "unit" })),
            ],
            creditsCharged: 1,
          };
        }
        return { results: [], creditsCharged: 1 };
      },
    };

    const report = await runDiscoveryBenchmark({
      mode: "mock",
      allowLiveNetwork: false,
      tavilyClient: client,
      ceilings: { maxQueries: 1, maxTavilyCredits: 1, maxRetainedListingUrls: 20 },
    });

    expect(report.tavily!.metrics.rawResultUrls).toBe(firstRunHubs.length + units.length);
    expect(report.tavily!.metrics.uniqueHubUrls).toBeGreaterThanOrEqual(15);
    // Hubs must not be retained
    expect(
      report.tavily!.retained.every((r) => r.bucket !== "hub_or_category")
    ).toBe(true);
    expect(
      report.tavily!.retained.every((r) =>
        FIRST_RUN_RETAINED_URL_FIXTURES.every((f) => f.url !== r.rawUrl)
      )
    ).toBe(true);
    // Retention filled only by proven units (≤4), not 20 hubs
    expect(report.tavily!.retained.length).toBeLessThanOrEqual(units.length);
    expect(report.tavily!.retained.length).toBeGreaterThan(0);
    expect(report.tavily!.retained.every((r) => r.bucket === "individual_listing")).toBe(
      true
    );
    expect(report.tavily!.metrics.retainedUrls).toBe(report.tavily!.retained.length);
  });
});

describe("mock discovery benchmark", () => {
  it("runs mock mode with zero DB writes and zero OpenAI calls", async () => {
    const report = await runDiscoveryBenchmark({
      mode: "mock",
      tavilyClient: createMockDiscoverySearchClient(),
      allowLiveNetwork: false,
    });
    expect(report.dbWrites).toBe(false);
    expect(report.openaiCalled).toBe(false);
    expect(report.tavilyExtractCalled).toBe(false);
    expect(report.tavily).toBeTruthy();
    expect(report.tavily!.queriesRun).toBeGreaterThan(0);
    expect(report.tavily!.creditsOrToolCalls).toBeLessThanOrEqual(
      report.ceilings.maxTavilyCredits
    );
    expect(report.tavily!.retained.length).toBeLessThanOrEqual(
      report.ceilings.maxRetainedListingUrls
    );
    expect(report.tavily!.rejectedUnsafeCount).toBeGreaterThan(0);
    expect(report.tavily!.retained.some((r) => r.provenance.length >= 1)).toBe(true);
    // Accurate metrics include hubs
    expect(report.tavily!.metrics.uniqueHubUrls).toBeGreaterThan(0);
    expect(report.tavily!.metrics.uniqueCanonicalUrlsAllBuckets).toBeGreaterThanOrEqual(
      report.tavily!.metrics.uniqueHubUrls +
        report.tavily!.metrics.uniqueIndividualUrls +
        report.tavily!.metrics.uniqueUnsafeUrls
    );
    // Retained must not include first-run hub shapes
    for (const r of report.tavily!.retained) {
      expect(FIRST_RUN_RETAINED_URL_FIXTURES.some((f) => f.url === r.canonicalUrl)).toBe(
        false
      );
      expect(r.bucket === "individual_listing" || r.bucket === "likely_listing_needs_inspection").toBe(
        true
      );
    }
  });

  it("respects credit and result ceilings", async () => {
    const report = await runDiscoveryBenchmark({
      mode: "mock",
      ceilings: { maxQueries: 3, maxTavilyCredits: 3, maxRetainedListingUrls: 2 },
      allowLiveNetwork: false,
    });
    expect(report.queryPlans.length).toBeLessThanOrEqual(3);
    expect(report.tavily!.creditsOrToolCalls).toBeLessThanOrEqual(3);
    expect(report.tavily!.queriesRun).toBeLessThanOrEqual(3);
    expect(report.tavily!.retained.length).toBeLessThanOrEqual(2);
  });

  it("records query-to-URL provenance on retained hits", async () => {
    const report = await runDiscoveryBenchmark({
      mode: "mock",
      allowLiveNetwork: false,
    });
    const withProv = report.tavily!.retained.find((r) => r.provenance.length >= 1);
    expect(withProv).toBeTruthy();
    expect(withProv!.provenance[0].queryId).toBeTruthy();
    expect(withProv!.provenance[0].query.length).toBeGreaterThan(0);
    expect(withProv!.provenance[0].rawUrl).toMatch(/^https?:\/\//);
  });

  it("refuses live_tavily without allowLiveNetwork", async () => {
    await expect(
      runDiscoveryBenchmark({ mode: "live_tavily", allowLiveNetwork: false })
    ).rejects.toThrow(/REFUSE/i);
  });

  it("Tavily-only mode never invokes OpenAI discovery", async () => {
    const openAiDiscovery = vi.fn(async () => ({
      urls: ["https://example.com/inventory/used-2019-box-1111"],
      toolCalls: 1,
      estimatedCostUsd: 0.01,
    }));
    const report = await runDiscoveryBenchmark({
      mode: "live_tavily",
      allowLiveNetwork: true,
      tavilyClient: createMockDiscoverySearchClient(),
      openAiDiscovery,
    });
    expect(openAiDiscovery).not.toHaveBeenCalled();
    expect(report.openaiCalled).toBe(false);
    expect(report.openai).toBeNull();
  });

  it("compare mode with injected OpenAI reports overlap without DB writes", async () => {
    const report = await runDiscoveryBenchmark({
      mode: "compare",
      allowLiveNetwork: false,
      tavilyClient: createMockDiscoverySearchClient(),
      openAiDiscovery: async () => ({
        urls: [
          "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001",
          "https://www.openai-only.example/inventory/used-2020-box-1111",
          "https://www.commercialtrucktrader.com/trucks-for-sale",
        ],
        toolCalls: 2,
        estimatedCostUsd: 0.02,
      }),
    });
    expect(report.dbWrites).toBe(false);
    expect(report.openaiCalled).toBe(true);
    expect(report.comparison).toBeTruthy();
    expect(report.comparison!.overlapCanonical.length).toBeGreaterThanOrEqual(1);
    expect(report.comparison!.openaiOnlyCanonical.length).toBeGreaterThanOrEqual(1);
  });

  it("preflight never includes key values and reports ceilings", () => {
    const pre = buildDiscoveryBenchmarkPreflight({
      mode: "live_tavily",
      tavilyKeyPresent: true,
      openAiKeyPresent: false,
    });
    expect(pre.dbWrites).toBe(false);
    expect(pre.tavilyExtract).toBe(false);
    expect(pre.openaiWillBeCalled).toBe(false);
    expect(pre.tavilyKeyPresent).toBe(true);
    expect(pre.exactQueryCount).toBeGreaterThan(0);
    expect(pre.estimatedMaxCostUsd).toBeGreaterThan(0);
    expect(pre.queries.length).toBe(pre.exactQueryCount);
    expect(JSON.stringify(pre)).not.toMatch(/tvly-|sk-/i);
  });
});

describe("success threshold", () => {
  it("documents the second-run quality gate", () => {
    expect(DISCOVERY_BENCHMARK_SUCCESS_THRESHOLD.minVerifiedIndividualUnitPages).toBe(5);
    expect(DISCOVERY_BENCHMARK_SUCCESS_THRESHOLD.minVerifiedIndividualShareOfRetained).toBe(
      0.25
    );
    expect(DISCOVERY_BENCHMARK_SUCCESS_THRESHOLD.maxEstimatedCostUsd).toBe(0.1);
  });

  it("fails when verified unit yield is below threshold (as live run 1 would)", () => {
    const retained = FIRST_RUN_RETAINED_URL_FIXTURES.map((f) => f.url);
    const result = evaluateDiscoveryBenchmarkSuccess({
      retainedCanonicalUrls: retained,
      verifiedIndividualCanonicalUrls: [],
      knownCategoryUrlsClassifiedIndividual: retained,
      unsafeRetainedCount: 0,
      estimatedCostUsd: 0.096,
      openaiCalled: false,
      tavilyExtractCalled: false,
      dbWrites: false,
    });
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });
});

describe("classifier GVWR boundary (existing rule)", () => {
  it("accepts 26,000 and rejects 26,001", () => {
    const base = {
      seller: "Dealer",
      sourceUrl: "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-9001",
      sourceScope: "debary",
      sourceListingId: "9001",
      canonicalListingUrl:
        "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-9001",
      stockNumber: "9001",
      vin: "",
      year: 2019,
      makeModel: "Freightliner M2",
      boxLengthFt: 26,
      boxLengthRaw: "26",
      engine: "Cummins",
      engineIsCummins: true,
      transmission: "Allison",
      transmissionIsAutomatic: true,
      listedWeightLbs: null,
      listedWeightTerm: "unknown" as const,
      gvwrDoorPlateVerified: false,
      mileage: 150000,
      hasLiftgate: true,
      liftgateNotes: "",
      price: 45000,
      location: "Joplin, MO",
      drivingDistanceMiles: 10,
      distanceIsEstimate: true,
      country: "United States",
      countryConfidence: "high" as const,
      countryEvidence: "US",
      listingLastChangedAt: null,
      lastSeenAt: null,
      notes: "",
      callOutcome: "not_called" as const,
      callNotes: "",
      askingPrice: 45000,
      auctionCurrentBid: null,
      priceType: "asking" as const,
      auctionEndAt: null,
      auctionEndKnown: false,
      listingStatus: "listed" as const,
      sourceChannel: "internet_search" as const,
      searchRunId: null,
      sellerContactId: null,
      specEvidence: {
        engine: "Cummins",
        transmission: "Allison automatic",
        boxLength: "26",
        gvwr: "26000",
      },
    };

    const pass = classifyLead(
      { ...base, manufacturerGvwrLbs: 26000 },
      DEFAULT_BUYING_PROFILE
    );
    expect(pass.status).not.toBe("does_not_match");
    expect(pass.reasons.some((r) => /accepted/i.test(r.label) && /26,000/i.test(r.label))).toBe(
      true
    );

    const fail = classifyLead(
      { ...base, manufacturerGvwrLbs: 26001 },
      DEFAULT_BUYING_PROFILE
    );
    expect(fail.status).toBe("does_not_match");
    expect(fail.reasons.some((r) => /26,001|exceeds|reject/i.test(r.label))).toBe(true);
  });

  it("rejects non-U.S. country at classification (not discovery)", () => {
    const lead = {
      seller: "CA Dealer",
      sourceUrl: "https://www.example.com/inventory/used-2019-freightliner-m2-9001",
      sourceScope: "example",
      sourceListingId: "9001",
      canonicalListingUrl: "https://www.example.com/inventory/used-2019-freightliner-m2-9001",
      stockNumber: "9001",
      vin: "",
      year: 2019,
      makeModel: "Freightliner M2",
      boxLengthFt: 26,
      boxLengthRaw: "26",
      engine: "Cummins",
      engineIsCummins: true,
      transmission: "Allison",
      transmissionIsAutomatic: true,
      manufacturerGvwrLbs: 26000,
      listedWeightLbs: null,
      listedWeightTerm: "unknown" as const,
      gvwrDoorPlateVerified: false,
      mileage: 100000,
      hasLiftgate: true,
      liftgateNotes: "",
      price: 40000,
      location: "Toronto, ON",
      drivingDistanceMiles: null,
      distanceIsEstimate: true,
      country: "Canada",
      countryConfidence: "high" as const,
      countryEvidence: "Canada",
      listingLastChangedAt: null,
      lastSeenAt: null,
      notes: "",
      callOutcome: "not_called" as const,
      callNotes: "",
      askingPrice: 40000,
      auctionCurrentBid: null,
      priceType: "asking" as const,
      auctionEndAt: null,
      auctionEndKnown: false,
      listingStatus: "listed" as const,
      sourceChannel: "internet_search" as const,
      searchRunId: null,
      sellerContactId: null,
      specEvidence: {},
    };
    const result = classifyLead(lead, DEFAULT_BUYING_PROFILE);
    expect(result.status).toBe("does_not_match");
    expect(result.reasons.some((r) => r.code === "country")).toBe(true);
  });
});
