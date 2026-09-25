/**
 * End-to-end deadline tests: hung Tavily / validation / OpenAI / Import
 * must not extend past deadlineAt; unprocessed URLs marked skipped.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createMockDiscoveryInspectSearchClient,
  createMockValidateFetchImpl,
} from "@/lib/sourcing/search/discovery-inspect/mock";
import { revalidateSelectedUrlsForImport } from "@/lib/sourcing/search/discovery-inspect/import-selected";
import { runDiscoveryInspectPreview } from "@/lib/sourcing/search/discovery-inspect/preview";
import {
  DeadlineExceededError,
  withDeadline,
} from "@/lib/sourcing/search/discovery-inspect/deadline";
import type { DiscoverySearchClient } from "@/lib/sourcing/search/discovery/types";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

const hangForever = <T,>() => new Promise<T>(() => {});

const UNIT_A =
  "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001";
const UNIT_B =
  "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-217623";

describe("withDeadline", () => {
  it("rejects when work hangs past deadlineAt", async () => {
    const deadlineAt = Date.now() + 40;
    const started = Date.now();
    await expect(withDeadline(hangForever(), deadlineAt, "hang")).rejects.toBeInstanceOf(
      DeadlineExceededError
    );
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("Preview end-to-end deadline", () => {
  it("cuts off hung Tavily before first results and marks partial Preview", async () => {
    const hungClient: DiscoverySearchClient = {
      search: async () => hangForever(),
    };
    const started = Date.now();
    const preview = await runDiscoveryInspectPreview({
      mode: "mock",
      confirmPaidProviders: true,
      tavilyClient: hungClient,
      validateFetchImpl: createMockValidateFetchImpl(),
      previewDeadlineMs: 80,
    });
    expect(Date.now() - started).toBeLessThan(800);
    expect(preview.dbWrites).toBe(false);
    expect(preview.retained.length).toBe(0);
    expect(preview.notes.some((n) => /partial preview|deadline/i.test(n))).toBe(true);
    expect(preview.notes.some((n) => /discovery|deadline/i.test(n))).toBe(true);
  });

  it("cuts off hung page validation and skips remaining URLs", async () => {
    let validateCalls = 0;
    const hangingFetch = (async () => {
      validateCalls += 1;
      return hangForever<Response>();
    }) as unknown as typeof fetch;

    const started = Date.now();
    const preview = await runDiscoveryInspectPreview({
      mode: "mock",
      confirmPaidProviders: true,
      tavilyClient: createMockDiscoveryInspectSearchClient(),
      validateFetchImpl: hangingFetch,
      previewDeadlineMs: 100,
      validateConcurrency: 1,
    });
    expect(Date.now() - started).toBeLessThan(1200);
    expect(preview.dbWrites).toBe(false);
    expect(validateCalls).toBeGreaterThan(0);
    expect(
      preview.rejectedBeforeInspect.some((r) => /skipped — preview deadline/i.test(r.reason)) ||
        preview.rows.some((r) => r.reasons.some((x) => /skipped — preview deadline/i.test(x))) ||
        preview.notes.some((n) => /deadline/i.test(n))
    ).toBe(true);
  });

  it("cuts off hung OpenAI inspection without merging and without extending past deadline", async () => {
    const incompleteHtml = `<!doctype html><html><head><title>2019 Freightliner</title></head>
<body><p>VIN 1HTEUMML5LH842637</p><p>Stock # 9001</p></body></html>`;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/debary|unit-217623|14496496/i.test(url)) {
        return new Response(incompleteHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return createMockValidateFetchImpl()(input);
    }) as typeof fetch;

    const openAi = vi.fn(async () => hangForever<{ truck: null }>());

    const started = Date.now();
    const preview = await runDiscoveryInspectPreview({
      mode: "mock",
      confirmPaidProviders: true,
      tavilyClient: createMockDiscoveryInspectSearchClient(),
      validateFetchImpl: fetchImpl,
      openAiInspectUrl: openAi,
      ceilings: { maxOpenAiInspectCalls: 10 },
      previewDeadlineMs: 120,
      validateConcurrency: 1,
    });
    expect(Date.now() - started).toBeLessThan(1500);
    expect(openAi).toHaveBeenCalled();
    expect(preview.dbWrites).toBe(false);
    // No OpenAI-invented facts; deadline noted.
    for (const row of preview.rows) {
      if (row.truck) {
        expect(row.truck.askingPrice).not.toBe(77777);
      }
    }
    expect(
      preview.notes.some((n) => /deadline/i.test(n)) ||
        preview.rows.some((r) => r.reasons.some((x) => /deadline/i.test(x))) ||
        preview.errors.some((e) => /deadline/i.test(e))
    ).toBe(true);
  });
});

describe("Import end-to-end deadline", () => {
  it("uses one overall deadline; hung URL skips remaining selections", async () => {
    let calls = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls += 1;
      const url = String(input);
      if (calls === 1 && /debary/i.test(url)) {
        // First URL hangs past Import deadline.
        return hangForever<Response>();
      }
      return createMockValidateFetchImpl()(input);
    }) as typeof fetch;

    const started = Date.now();
    const result = await revalidateSelectedUrlsForImport({
      selectedUrls: [UNIT_A, UNIT_B],
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      fetchImpl,
      importDeadlineMs: 80,
    });
    expect(Date.now() - started).toBeLessThan(800);
    expect(result.tavilyCalls).toBe(0);
    expect(result.openAiCalls).toBe(0);
    expect(result.trucks.length).toBe(0);
    expect(result.stoppedReason).toMatch(/deadline/i);
    expect(result.rejected.every((r) => /skipped — import deadline/i.test(r.reason))).toBe(true);
    expect(result.rejected.map((r) => r.url)).toEqual(
      expect.arrayContaining([UNIT_A, UNIT_B])
    );
  });

  it("does not start a fresh per-URL deadline that would allow a hang to complete", async () => {
    // Absolute deadline already in the past → every URL skipped immediately.
    const result = await revalidateSelectedUrlsForImport({
      selectedUrls: [UNIT_A, UNIT_B],
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      fetchImpl: createMockValidateFetchImpl(),
      deadlineAt: Date.now() - 1,
    });
    expect(result.trucks.length).toBe(0);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.every((r) => /skipped — import deadline/i.test(r.reason))).toBe(true);
  });
});
