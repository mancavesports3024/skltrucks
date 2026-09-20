import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";
import {
  runOpenAiInspectOnlyUrls,
  type OpenAiResponsesClient,
} from "@/lib/sourcing/search/providers/openai";
import { runMockPenskeUrlInspection } from "@/lib/sourcing/search/penske-url-inspection/mock";
import { parseInspectPayloadJson } from "@/lib/sourcing/search/openai-normalize";

const UNIT =
  "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-228474";

function fakeResponse(opts: {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  webSearchCalls?: number;
}) {
  const output: Array<Record<string, unknown>> = [];
  for (let i = 0; i < (opts.webSearchCalls ?? 0); i++) {
    output.push({ type: "web_search_call", action: { type: "search" } });
  }
  output.push({
    type: "message",
    content: [{ type: "output_text", text: opts.text }],
  });
  return {
    output_text: opts.text,
    output,
    usage: {
      input_tokens: opts.inputTokens ?? 100,
      output_tokens: opts.outputTokens ?? 50,
    },
  } as unknown as Awaited<ReturnType<OpenAiResponsesClient["responses"]["create"]>>;
}

function mockClient(
  handler: (params: unknown, callIndex: number) => ReturnType<typeof fakeResponse>
) {
  let callIndex = 0;
  const create = vi.fn(async (params: unknown) => {
    const idx = callIndex++;
    return handler(params, idx);
  });
  return { client: { responses: { create } } as OpenAiResponsesClient, create };
}

function inspectJson(listingUrl: string, over: Record<string, unknown> = {}) {
  return JSON.stringify({
    truck: {
      listingUrl,
      sourceName: "Penske Used Trucks",
      seller: "Penske Used Trucks",
      stockNumber: "228474",
      vin: "",
      year: 2019,
      makeModel: "Freightliner M2",
      engine: "Cummins",
      engineIsCummins: true,
      engineEvidence: "Cummins",
      transmission: "automatic",
      transmissionIsAutomatic: true,
      transmissionEvidence: "automatic",
      boxLengthFt: 26,
      boxLengthEvidence: "26'0\"",
      manufacturerGvwrLbs: 25500,
      listedWeightLbs: 25500,
      listedWeightTerm: "gvwr",
      gvwrEvidence: "GVWR 25500",
      mileage: 100000,
      hasLiftgate: true,
      askingPrice: 40000,
      auctionCurrentBid: null,
      location: "TX",
      drivingDistanceMiles: null,
      distanceIsEstimate: true,
      phone: "1-866-309-1962",
      contactName: "",
      contactRole: "",
      evidenceUrl: listingUrl,
      notes: "",
      ...over,
    },
    contact: null,
    rejectReason: "",
  });
}

describe("OpenAI inspect-only (Penske Phase A)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("performs no discovery — only inspects supplied URLs", async () => {
    const { client, create } = mockClient((_params, idx) => {
      expect(idx).toBe(0);
      const p = _params as { input?: Array<{ content?: string }> };
      const blob = JSON.stringify(p.input ?? []);
      expect(blob).not.toMatch(/listingUrls \(max/i);
      expect(blob).toContain(UNIT);
      expect(blob).toMatch(/THIS URL ONLY|exact listing URL/i);
      return fakeResponse({ text: inspectJson(UNIT), webSearchCalls: 1 });
    });

    const result = await runOpenAiInspectOnlyUrls(DEFAULT_BUYING_PROFILE, [UNIT], {
      client,
      maxToolCalls: 10,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.payload.trucks).toHaveLength(1);
    expect(result.payload.trucks[0].listingUrl).toBe(UNIT);
    expect(result.payload.queriesUsed.every((q) => q.startsWith("inspect:"))).toBe(true);
    expect(result.usage.webSearchCalls).toBe(1);
    expect(result.usage.provider).toBe("openai");
  });

  it("rejects when model replaces the submitted listing URL", () => {
    const swapped =
      "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-999999";
    const parsed = parseInspectPayloadJson(inspectJson(swapped), UNIT);
    expect(parsed.truck).toBeNull();
    expect(parsed.rejectReason).toMatch(/must equal supplied URL/i);
  });

  it("continues after a partial inspection failure", async () => {
    const unit2 =
      "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-416704";
    const { client, create } = mockClient((_params, idx) => {
      if (idx === 0) {
        return fakeResponse({ text: "{ not json", webSearchCalls: 1 });
      }
      if (idx === 1) {
        // format retry still bad
        return fakeResponse({ text: "{ still bad", webSearchCalls: 0 });
      }
      return fakeResponse({ text: inspectJson(unit2), webSearchCalls: 1 });
    });

    const result = await runOpenAiInspectOnlyUrls(
      DEFAULT_BUYING_PROFILE,
      [UNIT, unit2],
      { client, maxToolCalls: 10 }
    );

    expect(create.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(result.payload.trucks).toHaveLength(1);
    expect(result.payload.trucks[0].listingUrl).toBe(unit2);
    expect(result.stageErrors?.length).toBeGreaterThan(0);
  });
});

describe("mock Penske inspect-only", () => {
  it("binds listingUrl to each submitted URL and can fail one URL", () => {
    const urls = [UNIT, UNIT.replace("228474", "416704")];
    const ok = runMockPenskeUrlInspection(DEFAULT_BUYING_PROFILE, urls);
    expect(ok.payload.trucks.map((t) => t.listingUrl)).toEqual(urls);

    const partial = runMockPenskeUrlInspection(DEFAULT_BUYING_PROFILE, urls, {
      failUrl: UNIT,
    });
    expect(partial.payload.trucks).toHaveLength(1);
    expect(partial.stageErrors?.[0]).toMatch(/malformed/);
  });
});
