import { describe, expect, it, vi } from "vitest";
import {
  classifyDiscoveryUrl,
  DISCOVERY_NOISE_HOST_SUFFIXES,
} from "@/lib/sourcing/search/discovery/url-classify";
import {
  FIRST_RUN_RETAINED_URL_FIXTURES,
  PROVEN_UNIT_VDP_FIXTURES,
} from "@/lib/sourcing/search/discovery-benchmark/first-run-fixtures";
import {
  assertPublicHttpUrl,
} from "@/lib/sourcing/search/discovery-inspect/fetch-page";
import {
  createMockDiscoveryInspectSearchClient,
  createMockValidateFetchImpl,
} from "@/lib/sourcing/search/discovery-inspect/mock";
import {
  buildDiscoveryInspectPreflight,
  runDiscoveryInspectPreview,
} from "@/lib/sourcing/search/discovery-inspect/preview";
import { validateDiscoveryCandidate } from "@/lib/sourcing/search/discovery-inspect/validate-url";
import {
  DEFAULT_DISCOVERY_INSPECT_CEILINGS,
  clampDiscoveryInspectCeilings,
  estimateDiscoveryInspectCombinedMaxCostUsd,
} from "@/lib/sourcing/search/discovery/ceilings";
import { classifyLead } from "@/lib/sourcing/match";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

describe("discovery-inspect classifier hardening", () => {
  it("keeps first-run false positives as hubs and proven VDPs as individual", () => {
    for (const f of FIRST_RUN_RETAINED_URL_FIXTURES) {
      expect(classifyDiscoveryUrl(f.url).bucket, f.id).toBe("hub_or_category");
    }
    for (const f of PROVEN_UNIT_VDP_FIXTURES) {
      expect(classifyDiscoveryUrl(f.url).bucket, f.id).toBe("individual_listing");
    }
  });

  it("excludes final-run noise hosts and auction-results indexes", () => {
    expect(DISCOVERY_NOISE_HOST_SUFFIXES).toContain("justanswer.com");
    expect(
      classifyDiscoveryUrl("https://www.justanswer.com/medium-and-heavy-truck/x.html").bucket
    ).toBe("hub_or_category");
    expect(
      classifyDiscoveryUrl(
        "https://www.cumminsforum.com/threads/vin-number-wrong.2515395/latest"
      ).bucket
    ).toBe("hub_or_category");
    expect(
      classifyDiscoveryUrl(
        "https://www.auctiontime.com/listings/auction-results/peterbilt/box-trucks/16004"
      ).bucket
    ).toBe("hub_or_category");
    expect(
      classifyDiscoveryUrl("https://example.com/docs/vin-coding.pdf").bucket
    ).toBe("hub_or_category");
    // Lot-details remain individual (not auction-results)
    expect(
      classifyDiscoveryUrl(
        "https://bid.lickskilletauctions.com/auctions/9692/lot-details/6bbbc94e-265d-4363-9dc1-b47b012bfd2d"
      ).bucket
    ).toBe("individual_listing");
  });
});

describe("URL validation", () => {
  it("rejects SSRF/private hosts", async () => {
    const local = await assertPublicHttpUrl("https://127.0.0.1/inventory/unit-1");
    expect(local.ok).toBe(false);
    const localhost = await assertPublicHttpUrl("http://localhost/x");
    expect(localhost.ok).toBe(false);
  });

  it("rejects redirect from unit URL to category page", async () => {
    const fetchImpl = createMockValidateFetchImpl();
    const result = await validateDiscoveryCandidate(
      "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-92601996",
      { fetchImpl }
    );
    expect(result.outcome).toBe("rejected");
    expect(result.reason).toMatch(/category|hub|search/i);
  });

  it("rejects PDF / non-HTML", async () => {
    const result = await validateDiscoveryCandidate(
      "https://www.example-dealer.com/inventory/used-2019-freightliner-m2-box-9001.pdf",
      { fetchImpl: createMockValidateFetchImpl() }
    );
    // PDF path classified as hub before fetch, or rejected as non-HTML
    expect(["rejected", "unverified"]).toContain(result.outcome);
  });

  it("marks 403 and bot challenge as unverified", async () => {
    const blocked = await validateDiscoveryCandidate(
      "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001-403-blocked",
      {
        fetchResult: {
          ok: false,
          reason: "HTTP 403",
          status: 403,
          finalUrl:
            "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001-403-blocked",
        },
      }
    );
    expect(blocked.outcome).toBe("unverified");

    const bot = await validateDiscoveryCandidate(
      "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001-bot-challenge",
      { fetchImpl: createMockValidateFetchImpl() }
    );
    expect(bot.outcome).toBe("unverified");
  });
});

describe("discovery-inspect Preview", () => {
  it("runs mock Preview with zero DB writes and respects caps", async () => {
    const preview = await runDiscoveryInspectPreview({
      mode: "mock",
      confirmPaidProviders: true,
      tavilyClient: createMockDiscoveryInspectSearchClient(),
      validateFetchImpl: createMockValidateFetchImpl(),
      allowLiveNetwork: false,
      ceilings: { maxInspectCandidates: 10, maxOpenAiInspectCalls: 0 },
    });
    expect(preview.dbWrites).toBe(false);
    expect(preview.previewOnly).toBe(true);
    expect(preview.tavilyExtractCalled).toBe(false);
    expect(preview.openaiDiscoveryCalled).toBe(false);
    expect(preview.tavilyCredits).toBeLessThanOrEqual(
      DEFAULT_DISCOVERY_INSPECT_CEILINGS.maxTavilyCredits
    );
    expect(preview.validated.length).toBeLessThanOrEqual(
      DEFAULT_DISCOVERY_INSPECT_CEILINGS.maxInspectCandidates
    );
    expect(preview.openAiInspectCalls).toBe(0);
    // Hubs / noise not import-eligible
    expect(preview.rows.every((r) => !/justanswer|auction-results|i2c44/i.test(r.finalUrl) || !r.importEligible)).toBe(
      true
    );
  });

  it("refuses live without paid confirmation", async () => {
    await expect(
      runDiscoveryInspectPreview({
        mode: "live",
        confirmPaidProviders: false,
        tavilyClient: createMockDiscoveryInspectSearchClient(),
      })
    ).rejects.toThrow(/REFUSE/i);
  });

  it("does not call OpenAI when not injected (Tavily-only path)", async () => {
    const openAi = vi.fn();
    const preview = await runDiscoveryInspectPreview({
      mode: "mock",
      confirmPaidProviders: true,
      tavilyClient: createMockDiscoveryInspectSearchClient(),
      validateFetchImpl: createMockValidateFetchImpl(),
      openAiInspectUrl: undefined,
    });
    expect(openAi).not.toHaveBeenCalled();
    expect(preview.openAiInspectCalls).toBe(0);
  });

  it("clamps client ceilings to server maxima", () => {
    const c = clampDiscoveryInspectCeilings({
      maxQueries: 99,
      maxTavilyCredits: 99,
      maxInspectCandidates: 99,
      maxOpenAiInspectCalls: 99,
    });
    expect(c.maxQueries).toBe(12);
    expect(c.maxTavilyCredits).toBe(12);
    expect(c.maxInspectCandidates).toBe(10);
    expect(c.maxOpenAiInspectCalls).toBe(10);
    const costs = estimateDiscoveryInspectCombinedMaxCostUsd(c);
    expect(costs.combinedMaxUsd).toBeLessThanOrEqual(0.25);
  });

  it("preflight reports ceilings without key values", () => {
    const pre = buildDiscoveryInspectPreflight({
      tavilyKeyPresent: true,
      openAiKeyPresent: false,
    });
    expect(pre.dbWritesOnPreview).toBe(false);
    expect(pre.tavilyExtract).toBe(false);
    expect(pre.openaiDiscoveryWillBeCalled).toBe(false);
    expect(pre.maxTavilyCredits).toBe(12);
    expect(JSON.stringify(pre)).not.toMatch(/tvly-|sk-/i);
  });
});

describe("classification rules reused", () => {
  it("accepts GVWR 26000 and rejects 26001; Canada rejected; missing evidence needs verification", () => {
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
        transmission: "Allison",
        boxLength: "26",
        gvwr: "26000",
      },
    };

    expect(
      classifyLead({ ...base, manufacturerGvwrLbs: 26000 }, DEFAULT_BUYING_PROFILE).status
    ).not.toBe("does_not_match");
    expect(
      classifyLead({ ...base, manufacturerGvwrLbs: 26001 }, DEFAULT_BUYING_PROFILE).status
    ).toBe("does_not_match");
    expect(
      classifyLead(
        { ...base, country: "Canada", location: "Toronto, ON", manufacturerGvwrLbs: 26000 },
        DEFAULT_BUYING_PROFILE
      ).status
    ).toBe("does_not_match");
    expect(
      classifyLead(
        {
          year: 2019,
          boxLengthFt: null,
          engineIsCummins: null,
          transmissionIsAutomatic: null,
          listedWeightLbs: null,
          listedWeightTerm: "unknown",
          manufacturerGvwrLbs: null,
          gvwrDoorPlateVerified: false,
          mileage: 150000,
          hasLiftgate: true,
          drivingDistanceMiles: 10,
          price: 45000,
          location: "Joplin, MO",
          country: "United States",
        },
        DEFAULT_BUYING_PROFILE
      ).status
    ).toBe("needs_verification");
  });
});
