import { describe, expect, it } from "vitest";
import { classifyLead } from "@/lib/sourcing/match";
import { extractTruckFromPageText } from "@/lib/sourcing/search/extract-from-text";
import { isIndividualListingUrl } from "@/lib/sourcing/search/map-candidates";
import { MOCK_TAVILY_SEARCH_PAGES } from "@/lib/sourcing/search/mocks";
import {
  MAX_TAVILY_CREDITS_PER_RUN,
  runTavilySearch,
  type TavilyClientLike,
} from "@/lib/sourcing/search/providers/tavily";
import { sanitizeProviderError } from "@/lib/sourcing/search/types";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

function mockTavilyClient(opts?: {
  searchCreditsPerCall?: number;
  extractCredits?: number;
}): TavilyClientLike {
  const searchCredits = opts?.searchCreditsPerCall ?? 1;
  let searchCalls = 0;
  return {
    async search(query: string) {
      searchCalls += 1;
      void query;
      // First call returns discovery pages; later calls return empty to save budget noise
      const results =
        searchCalls === 1
          ? MOCK_TAVILY_SEARCH_PAGES.map((p) => ({
              url: p.url,
              title: p.title,
              content: p.content,
            }))
          : [];
      return { results, usage: { credits: searchCredits } };
    },
    async extract(urls: string[] | string) {
      const list = Array.isArray(urls) ? urls : [urls];
      const results = list
        .map((url) => {
          const page = MOCK_TAVILY_SEARCH_PAGES.find((p) => p.url === url);
          return page
            ? { url, rawContent: page.content }
            : { url, rawContent: null };
        })
        .filter((r) => r.rawContent);
      const credits =
        opts?.extractCredits ??
        (results.length > 0 ? Math.ceil(results.length / 5) : 0);
      return { results, usage: { credits } };
    },
  };
}

describe("extractTruckFromPageText", () => {
  it("pulls evidenced specs and phone from published text only", () => {
    const truck = extractTruckFromPageText(MOCK_TAVILY_SEARCH_PAGES[0]);
    expect(truck.phone).toBe("(407) 321-4244");
    expect(truck.vin).toBe("3ALACWDT0KDHV9001");
    expect(truck.engineIsCummins).toBe(true);
    expect(truck.engineEvidence).toMatch(/Cummins/);
    expect(truck.gvwrEvidence).toMatch(/GVWR/i);
    expect(truck.manufacturerGvwrLbs).toBe(25500);
    expect(truck.askingPrice).toBe(42900);
  });

  it("treats GVW-only as not manufacturer GVWR", () => {
    const truck = extractTruckFromPageText(MOCK_TAVILY_SEARCH_PAGES[2]);
    expect(truck.listedWeightTerm).toBe("gvw");
    expect(truck.manufacturerGvwrLbs).toBeNull();
    expect(truck.gvwrEvidence).toBe("");
  });
});

describe("runTavilySearch (mocked client)", () => {
  it("accepts individual listings, rejects category pages, tracks credits ≤ 20", async () => {
    const result = await runTavilySearch(DEFAULT_BUYING_PROFILE, {
      client: mockTavilyClient(),
      maxCredits: MAX_TAVILY_CREDITS_PER_RUN,
      maxSearches: 4,
      maxExtractUrls: 10,
    });

    expect(result.provider).toBe("tavily");
    expect(result.usage.creditsConsumed).toBeLessThanOrEqual(MAX_TAVILY_CREDITS_PER_RUN);
    expect(result.usage.creditsConsumed).toBeGreaterThan(0);
    expect(result.usage.provider).toBe("tavily");

    const urls = result.payload.trucks.map((t) => t.listingUrl);
    expect(urls.some((u) => isIndividualListingUrl(u))).toBe(true);
    expect(urls).not.toContain("https://www.penskeusedtrucks.com/search-inventory/");

    const confirmed = result.payload.trucks.find((t) =>
      t.listingUrl.includes("debarytrucksales")
    )!;
    expect(confirmed.phone).toMatch(/407/);
    const match = classifyLead(
      {
        year: confirmed.year,
        boxLengthFt: confirmed.boxLengthFt,
        engineIsCummins: confirmed.engineIsCummins,
        transmissionIsAutomatic: confirmed.transmissionIsAutomatic,
        listedWeightLbs: confirmed.listedWeightLbs,
        listedWeightTerm: confirmed.listedWeightTerm,
        manufacturerGvwrLbs: confirmed.manufacturerGvwrLbs,
        gvwrDoorPlateVerified: false,
        mileage: confirmed.mileage,
        hasLiftgate: confirmed.hasLiftgate,
        drivingDistanceMiles: confirmed.drivingDistanceMiles,
        price: confirmed.askingPrice,
      },
      DEFAULT_BUYING_PROFILE,
      new Date("2026-09-19")
    );
    // Full evidence from snippet → confirmed; GVW-only miller → needs verification separately
    expect(["confirmed_match", "needs_verification"]).toContain(match.status);

    expect(result.payload.contacts.some((c) => c.phone.includes("407"))).toBe(true);
  });

  it("stops before exceeding credit budget", async () => {
    const greedy: TavilyClientLike = {
      async search() {
        return {
          results: MOCK_TAVILY_SEARCH_PAGES.map((p) => ({
            url: p.url,
            title: p.title,
            content: "short",
          })),
          usage: { credits: 1 },
        };
      },
      async extract() {
        return { results: [], usage: { credits: 0 } };
      },
    };
    const result = await runTavilySearch(DEFAULT_BUYING_PROFILE, {
      client: greedy,
      maxCredits: 3,
      maxSearches: 10,
      maxExtractUrls: 0,
    });
    expect(result.usage.creditsConsumed).toBeLessThanOrEqual(3);
    expect(result.usage.searchesRun).toBeLessThanOrEqual(3);
  });
});

describe("sanitizeProviderError", () => {
  it("redacts API key-looking strings", () => {
    expect(sanitizeProviderError(new Error("fail tvly-abc123XYZ"))).not.toMatch(/tvly-abc/);
    expect(sanitizeProviderError(new Error("Bearer sk-secret"))).toMatch(/\[redacted\]/);
  });
});
