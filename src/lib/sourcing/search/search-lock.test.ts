import { describe, expect, it, afterEach } from "vitest";
import {
  createMemorySearchLockStore,
  isSearchLockExpired,
  SEARCH_ALREADY_RUNNING_MESSAGE,
  setSearchLockStoreForTests,
} from "@/lib/sourcing/search/search-lock";
import { runProviderSearchWithLock } from "@/lib/sourcing/search/run";
import type { SearchProviderResult } from "@/lib/sourcing/search/providers/types";

function mockSearchResult(): SearchProviderResult {
  return {
    provider: "mock",
    queriesPlanned: ["q"],
    payload: {
      trucks: [],
      contacts: [],
      sourcesConsulted: [],
      queriesUsed: ["q"],
      notes: "Mock payload",
    },
    usage: {
      provider: "mock",
      model: "none",
      webSearchCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      live: false,
      creditsConsumed: 0,
    },
    rawText: "",
  };
}

describe("search lock helpers", () => {
  it("treats missing/epoch expires_at as expired (stale recovery)", () => {
    expect(isSearchLockExpired(null)).toBe(true);
    expect(isSearchLockExpired(new Date(0))).toBe(true);
    expect(isSearchLockExpired(new Date(Date.now() + 60_000))).toBe(false);
  });

  it("memory store allows stale takeover and same-holder refresh", async () => {
    const lock = createMemorySearchLockStore();
    const t0 = new Date("2026-09-19T16:00:00Z");
    expect((await lock.tryAcquire("a@skl.com", t0, 60_000)).ok).toBe(true);
    expect((await lock.tryAcquire("b@skl.com", t0, 60_000)).ok).toBe(false);

    const afterTtl = new Date(t0.getTime() + 61_000);
    expect((await lock.tryAcquire("b@skl.com", afterTtl, 60_000)).ok).toBe(true);
  });
});

describe("concurrency: only one mocked provider call", () => {
  afterEach(() => {
    setSearchLockStoreForTests(null);
  });

  it("two simultaneous requests: one provider call, blocked returns clear message", async () => {
    const lock = createMemorySearchLockStore();
    setSearchLockStoreForTests(lock);

    let providerCalls = 0;
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const runSearch = async () => {
      providerCalls += 1;
      await gate;
      return mockSearchResult();
    };

    const first = runProviderSearchWithLock({
      lock,
      holderEmail: "staff@skl.com",
      runSearch,
    });

    // Let first acquire before second starts
    await new Promise((r) => setTimeout(r, 10));

    const second = await runProviderSearchWithLock({
      lock,
      holderEmail: "other@skl.com",
      runSearch,
    });

    expect(second.error).toBe(SEARCH_ALREADY_RUNNING_MESSAGE);
    expect(second.search).toBeUndefined();
    expect(providerCalls).toBe(1);

    releaseGate();
    const firstResult = await first;
    expect(firstResult.search?.provider).toBe("mock");
    expect(providerCalls).toBe(1);

    // After release, a third call may run the provider
    const third = await runProviderSearchWithLock({
      lock,
      holderEmail: "staff@skl.com",
      runSearch: async () => {
        providerCalls += 1;
        return mockSearchResult();
      },
    });
    expect(third.search).toBeTruthy();
    expect(providerCalls).toBe(2);
  });

  it("releases the lock when the provider throws", async () => {
    const lock = createMemorySearchLockStore();
    const boom = runProviderSearchWithLock({
      lock,
      holderEmail: "staff@skl.com",
      runSearch: async () => {
        throw new Error("provider down");
      },
    });
    await expect(boom).rejects.toThrow(/provider down/);

    const next = await runProviderSearchWithLock({
      lock,
      holderEmail: "other@skl.com",
      runSearch: async () => mockSearchResult(),
    });
    expect(next.search?.payload.notes).toMatch(/Mock/);
  });
});
