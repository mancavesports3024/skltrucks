import { describe, expect, it } from "vitest";
import { resolveSearchProviderId } from "@/lib/sourcing/search/providers/index";

describe("resolveSearchProviderId", () => {
  it("forceMock always wins", () => {
    expect(resolveSearchProviderId({ forceMock: true })).toBe("mock");
  });

  it("falls back to mock when no live keys in env", () => {
    const prevTavily = process.env.TAVILY_API_KEY;
    const prevOpenAi = process.env.OPENAI_API_KEY;
    const prevPrefer = process.env.SOURCING_SEARCH_PROVIDER;
    delete process.env.TAVILY_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.SOURCING_SEARCH_PROVIDER;
    try {
      expect(resolveSearchProviderId()).toBe("mock");
    } finally {
      if (prevTavily !== undefined) process.env.TAVILY_API_KEY = prevTavily;
      if (prevOpenAi !== undefined) process.env.OPENAI_API_KEY = prevOpenAi;
      if (prevPrefer !== undefined) process.env.SOURCING_SEARCH_PROVIDER = prevPrefer;
    }
  });
});
