import { describe, expect, it } from "vitest";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";
import {
  buildFailedSearchReport,
  ProviderSearchError,
} from "@/lib/sourcing/search/provider-error";
import { createMemorySearchLockStore } from "@/lib/sourcing/search/search-lock";

describe("buildFailedSearchReport", () => {
  it("failed OpenAI run is labeled openai/live with partial usage — never mock", () => {
    const err = new ProviderSearchError({
      provider: "openai",
      live: true,
      stage: "discovery",
      staffMessage: "OpenAI returned invalid structured data during discovery.",
      usage: {
        provider: "openai",
        model: "gpt-4o-mini",
        webSearchCalls: 2,
        inputTokens: 500,
        outputTokens: 120,
        estimatedCostUsd: 0.0215,
        live: true,
        creditsConsumed: 0,
        formatRetries: 1,
      },
      queriesExecuted: ["cummins box truck"],
      formatRetries: 1,
    });

    const report = buildFailedSearchReport({
      profile: DEFAULT_BUYING_PROFILE,
      error: err,
      resolvedProviderId: "openai",
      resolvedModel: "gpt-4o-mini",
    });

    expect(report.status).toBe("failed");
    expect(report.apiUsage.provider).toBe("openai");
    expect(report.apiUsage.live).toBe(true);
    expect(report.apiUsage.provider).not.toBe("mock");
    expect(report.apiUsage.estimatedCostUsd).toBe(0.0215);
    expect(report.apiUsage.inputTokens).toBe(500);
    expect(report.apiUsage.outputTokens).toBe(120);
    expect(report.apiUsage.webSearchCalls).toBe(2);
    expect(report.apiUsage.formatRetries).toBe(1);
    expect(report.queriesExecuted).toEqual(["cummins box truck"]);
    expect(report.errors[0]).toMatch(/discovery/i);
    expect(report.newLeadsSaved).toBe(0);
    expect(report.trucksSaved).toEqual([]);
  });

  it("generic throw still uses resolved openai provider — never hardcoded mock", () => {
    const report = buildFailedSearchReport({
      profile: DEFAULT_BUYING_PROFILE,
      error: new Error("network blip"),
      resolvedProviderId: "openai",
      resolvedModel: "gpt-4o-mini",
    });
    expect(report.apiUsage.provider).toBe("openai");
    expect(report.apiUsage.live).toBe(true);
    expect(report.apiUsage.model).toBe("gpt-4o-mini");
    expect(report.errors[0]).toMatch(/network blip/);
  });
});

describe("runProviderSearchWithLock + ProviderSearchError", () => {
  it("does not swallow ProviderSearchError metadata", async () => {
    const { runProviderSearchWithLock } = await import("@/lib/sourcing/search/run");
    const lock = createMemorySearchLockStore();
    const boom = new ProviderSearchError({
      provider: "openai",
      live: true,
      stage: "discovery",
      staffMessage: "OpenAI returned invalid structured data during discovery.",
      usage: {
        provider: "openai",
        model: "gpt-4o-mini",
        webSearchCalls: 1,
        inputTokens: 200,
        outputTokens: 40,
        estimatedCostUsd: 0.0101,
        live: true,
        creditsConsumed: 0,
      },
    });

    await expect(
      runProviderSearchWithLock({
        lock,
        holderEmail: "staff@skl.com",
        runSearch: async () => {
          throw boom;
        },
      })
    ).rejects.toBe(boom);
  });
});
