import { describe, expect, it } from "vitest";
import { classifyLead } from "@/lib/sourcing/match";
import {
  candidateToContactInput,
  candidateToTruckLeadInput,
  isIndividualListingUrl,
} from "@/lib/sourcing/search/map-candidates";
import { MOCK_SEARCH_PAYLOAD } from "@/lib/sourcing/search/mocks";
import { buildSearchQueriesFromProfile } from "@/lib/sourcing/search/queries";
import { evaluateSearchPayloadForTest } from "@/lib/sourcing/search/evaluate";
import {
  estimateSearchCostUsd,
} from "@/lib/sourcing/search/types";
import { parseSearchPayloadJson } from "@/lib/sourcing/search/openai-client";
import { DEFAULT_BUYING_PROFILE, type TruckLead } from "@/types/sourcing";

describe("buildSearchQueriesFromProfile", () => {
  it("embeds active profile constraints (not hard-coded alone)", () => {
    const queries = buildSearchQueriesFromProfile(DEFAULT_BUYING_PROFILE, new Date("2026-09-19"));
    const blob = queries.join(" ");
    expect(blob).toMatch(/Cummins/i);
    expect(blob).toMatch(/automatic/i);
    expect(blob).toMatch(/24|26|28/);
    expect(blob).toMatch(/GVWR 26000 or less|GVWR under 26000|GVWR under 26,000/i);
    expect(blob).toMatch(/275,?000/);
    expect(blob).toMatch(/Joplin/i);
    expect(blob).toMatch(/liftgate/i);
    expect(queries.length).toBeGreaterThanOrEqual(5);
  });

  it("changes when profile changes", () => {
    const alt = buildSearchQueriesFromProfile(
      { ...DEFAULT_BUYING_PROFILE, requireCummins: false, maxMileage: 100000 },
      new Date("2026-09-19")
    );
    expect(alt.join(" ")).not.toMatch(/\bCummins\b/);
    expect(alt.join(" ")).toMatch(/100,?000/);
  });
});

describe("isIndividualListingUrl", () => {
  it("accepts unit inventory pages and rejects category/search pages", () => {
    expect(
      isIndividualListingUrl(
        "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-mock-intake-9001"
      )
    ).toBe(true);
    expect(isIndividualListingUrl("https://www.penskeusedtrucks.com/search-inventory/")).toBe(
      false
    );
    expect(isIndividualListingUrl("https://www.penskeusedtrucks.com/inventory/")).toBe(false);
    expect(isIndividualListingUrl("https://www.youtube.com/watch?v=abc")).toBe(false);
    expect(isIndividualListingUrl("https://www.reddit.com/r/trucks/comments/x")).toBe(false);
    expect(isIndividualListingUrl("")).toBe(false);
  });
});

describe("candidate mapping + evidence gate", () => {
  it("maps full-evidence mock truck and classifies as confirmed match", () => {
    const truck = MOCK_SEARCH_PAYLOAD.trucks[0];
    const mapped = candidateToTruckLeadInput(truck);
    expect(mapped.rejectReason).toBeUndefined();
    expect(mapped.input.verificationNotes).toMatch(/\(407\) 321-4244/);
    expect(mapped.input.specEvidence.engine).toMatch(/Cummins/);
    const match = classifyLead(mapped.input, DEFAULT_BUYING_PROFILE, new Date("2026-09-19"));
    expect(match.status).toBe("confirmed_match");
  });

  it("does not treat GVW-only listing as confirmed; needs verification", () => {
    const truck = MOCK_SEARCH_PAYLOAD.trucks[1];
    const mapped = candidateToTruckLeadInput(truck);
    expect(mapped.rejectReason).toBeUndefined();
    // Missing evidence nulls required claims
    expect(mapped.input.engineIsCummins).toBeNull();
    expect(mapped.input.manufacturerGvwrLbs).toBeNull();
    expect(mapped.input.listedWeightTerm).toBe("gvw");
    const match = classifyLead(mapped.input, DEFAULT_BUYING_PROFILE, new Date("2026-09-19"));
    expect(match.status).toBe("needs_verification");
  });

  it("rejects category search URLs", () => {
    const mapped = candidateToTruckLeadInput(MOCK_SEARCH_PAYLOAD.trucks[2]);
    expect(mapped.rejectReason).toMatch(/individual listing/i);
  });

  it("rejects contacts without a published phone", () => {
    const bad = candidateToContactInput(MOCK_SEARCH_PAYLOAD.contacts[1]);
    expect(bad.rejectReason).toMatch(/phone/i);
    const good = candidateToContactInput(MOCK_SEARCH_PAYLOAD.contacts[0]);
    expect(good.rejectReason).toBeUndefined();
    expect(good.input.phone).toBe("(407) 321-4244");
  });
});

describe("evaluateSearchPayloadForTest (dedupe + digest kinds)", () => {
  it("inserts new, rejects category page, keeps usable phone on contact", () => {
    const result = evaluateSearchPayloadForTest(
      DEFAULT_BUYING_PROFILE,
      MOCK_SEARCH_PAYLOAD,
      []
    );
    expect(result.rejected).toBeGreaterThanOrEqual(1);
    const inserted = result.trucks.filter((t) => t.outcome === "inserted");
    expect(inserted.length).toBe(2);
    expect(inserted[0].phone).toMatch(/407/);
    expect(result.contacts.some((c) => c.outcome === "inserted" && c.phone)).toBe(true);
    expect(result.contacts.some((c) => c.outcome === "rejected")).toBe(true);
  });

  it("marks second pass as seen_again when content unchanged", () => {
    const first = evaluateSearchPayloadForTest(
      DEFAULT_BUYING_PROFILE,
      { ...MOCK_SEARCH_PAYLOAD, trucks: [MOCK_SEARCH_PAYLOAD.trucks[0]] },
      []
    );
    const mapped = candidateToTruckLeadInput(MOCK_SEARCH_PAYLOAD.trucks[0]);
    const existing: TruckLead = {
      id: "existing-1",
      ...mapped.input,
      matchStatus: "confirmed_match",
      matchReasons: [],
      listingFirstSeenAt: "2026-09-18T12:00:00.000Z",
      listingLastChangedAt: "2026-09-18T12:00:00.000Z",
      listingLastSeenAt: "2026-09-18T12:00:00.000Z",
    };
    const second = evaluateSearchPayloadForTest(
      DEFAULT_BUYING_PROFILE,
      { ...MOCK_SEARCH_PAYLOAD, trucks: [MOCK_SEARCH_PAYLOAD.trucks[0]] },
      [existing]
    );
    expect(first.trucks[0].outcome).toBe("inserted");
    expect(second.trucks[0].outcome).toBe("seen_again");
  });
});

describe("cost estimate + JSON parse", () => {
  it("estimates roughly $0.01+ per web_search call", () => {
    const cost = estimateSearchCostUsd({
      webSearchCalls: 4,
      inputTokens: 8000,
      outputTokens: 2000,
    });
    // 4 * $0.01 + token share ≈ $0.04+
    expect(cost).toBeGreaterThanOrEqual(0.04);
    expect(cost).toBeLessThan(0.1);
  });

  it("parses fenced JSON payloads and drops incomplete/invalid trucks/contacts", () => {
    const raw = "```json\n" + JSON.stringify(MOCK_SEARCH_PAYLOAD) + "\n```";
    const parsed = parseSearchPayloadJson(raw);
    // Category search page + contact without phone are rejected at normalize time
    expect(parsed.trucks).toHaveLength(2);
    expect(parsed.contacts).toHaveLength(1);
    expect(parsed.trucks.every((t) => t.listingUrl)).toBe(true);
    expect(parsed.contacts[0].company).toBeTruthy();
    expect(parsed.contacts[0].phone).toBeTruthy();
    expect(parsed.contacts[0].sourceUrl).toBeTruthy();
  });
});
