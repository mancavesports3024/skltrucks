import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";
import {
  runOpenAiProviderSearch,
  type OpenAiResponsesClient,
} from "@/lib/sourcing/search/providers/openai";
import { ProviderSearchError } from "@/lib/sourcing/search/provider-error";

const dir = resolve(__dirname, "../../../../fixtures/sourcing/json-malformed");
const load = (name: string) => readFileSync(resolve(dir, name), "utf8");

const URL_DEBARY =
  "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-mock-intake-9001";
const URL_MILLER =
  "https://www.millerusedtrucks.com/inventory/used-2018-freightliner-m2-mock-383999";

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

describe("OpenAI provider: malformed JSON + retry + partial inspect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("discovery parse failure after retry throws ProviderSearchError openai/live with usage", async () => {
    const { client, create } = mockClient((_params, idx) => {
      if (idx === 0) {
        return fakeResponse({
          text: load("truncated.json"),
          webSearchCalls: 1,
          inputTokens: 200,
          outputTokens: 40,
        });
      }
      const p = _params as { tools?: unknown[]; max_tool_calls?: number };
      expect(p.tools).toEqual([]);
      expect(p.max_tool_calls).toBe(0);
      return fakeResponse({
        text: load("unquoted-property.json"),
        webSearchCalls: 0,
        inputTokens: 80,
        outputTokens: 20,
      });
    });

    let err: ProviderSearchError | undefined;
    try {
      await runOpenAiProviderSearch(DEFAULT_BUYING_PROFILE, { client });
    } catch (e) {
      err = e as ProviderSearchError;
    }

    expect(err).toBeInstanceOf(ProviderSearchError);
    expect(err!.provider).toBe("openai");
    expect(err!.live).toBe(true);
    expect(err!.stage).toBe("discovery");
    expect(err!.staffMessage).toBe(
      "OpenAI returned invalid structured data during discovery."
    );
    expect(err!.usage.provider).toBe("openai");
    expect(err!.usage.live).toBe(true);
    expect(err!.usage.provider).not.toBe("mock");
    expect(err!.usage.inputTokens).toBe(280);
    expect(err!.usage.outputTokens).toBe(60);
    expect(err!.usage.webSearchCalls).toBe(1);
    expect(err!.usage.estimatedCostUsd).toBeGreaterThan(0);
    expect(err!.formatRetries).toBe(1);
    expect(create.mock.calls.length).toBe(2);
  });

  it("discovery retry success then continues to inspect", async () => {
    const { client, create } = mockClient((params, idx) => {
      if (idx === 0) {
        return fakeResponse({
          text: load("comments.json"),
          webSearchCalls: 1,
          inputTokens: 150,
          outputTokens: 30,
        });
      }
      if (idx === 1) {
        const p = params as { tools?: unknown[]; max_tool_calls?: number };
        expect(p.tools).toEqual([]);
        expect(p.max_tool_calls).toBe(0);
        return fakeResponse({
          text: load("discovery-valid.json"),
          webSearchCalls: 0,
          inputTokens: 60,
          outputTokens: 25,
        });
      }
      const blob = JSON.stringify(params);
      if (blob.includes(URL_DEBARY)) {
        return fakeResponse({
          text: load("inspect-valid-debary.json"),
          webSearchCalls: 1,
          inputTokens: 120,
          outputTokens: 80,
        });
      }
      return fakeResponse({
        text: load("inspect-valid-miller.json"),
        webSearchCalls: 1,
        inputTokens: 110,
        outputTokens: 70,
      });
    });

    const result = await runOpenAiProviderSearch(DEFAULT_BUYING_PROFILE, { client });
    expect(result.provider).toBe("openai");
    expect(result.usage.live).toBe(true);
    expect(result.usage.formatRetries).toBe(1);
    expect(result.payload.trucks.length).toBe(2);
    expect(create.mock.calls.length).toBe(4);
  });

  it("one inspection failure continues; zero leads from malformed records", async () => {
    const { client } = mockClient((_params, idx) => {
      if (idx === 0) {
        return fakeResponse({
          text: load("discovery-valid.json"),
          webSearchCalls: 1,
          inputTokens: 100,
          outputTokens: 40,
        });
      }
      if (idx === 1) {
        return fakeResponse({
          text: load("truncated.json"),
          webSearchCalls: 1,
          inputTokens: 90,
          outputTokens: 20,
        });
      }
      if (idx === 2) {
        return fakeResponse({
          text: load("unquoted-property.json"),
          webSearchCalls: 0,
          inputTokens: 40,
          outputTokens: 10,
        });
      }
      return fakeResponse({
        text: load("inspect-valid-miller.json"),
        webSearchCalls: 1,
        inputTokens: 100,
        outputTokens: 60,
      });
    });

    const result = await runOpenAiProviderSearch(DEFAULT_BUYING_PROFILE, { client });
    expect(result.provider).toBe("openai");
    expect(result.usage.live).toBe(true);
    expect(result.payload.trucks).toHaveLength(1);
    expect(result.payload.trucks[0].listingUrl).toBe(URL_MILLER);
    expect(result.stageErrors?.some((e) => /inspection/i.test(e) && e.includes(URL_DEBARY))).toBe(
      true
    );
    expect(result.payload.trucks.some((t) => t.listingUrl === URL_DEBARY)).toBe(false);
  });

  it("inspection trailing-comma cleans up without format retry", async () => {
    const { client, create } = mockClient((_params, idx) => {
      if (idx === 0) {
        return fakeResponse({
          text: JSON.stringify({
            listingUrls: [URL_MILLER],
            queriesUsed: ["q"],
            sourcesConsulted: [URL_MILLER],
            notes: "",
          }),
          webSearchCalls: 1,
        });
      }
      return fakeResponse({
        text: load("inspect-trailing-comma.json"),
        webSearchCalls: 1,
      });
    });

    const result = await runOpenAiProviderSearch(DEFAULT_BUYING_PROFILE, { client });
    expect(result.payload.trucks).toHaveLength(1);
    expect(result.usage.formatRetries ?? 0).toBe(0);
    expect(create.mock.calls.length).toBe(2);
  });
});
