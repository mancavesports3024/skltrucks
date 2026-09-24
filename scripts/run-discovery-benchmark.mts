/**
 * Read-only discovery benchmark CLI (staff/local only).
 *
 * Default: mock (zero network, zero DB writes, zero OpenAI).
 *
 * Live / compare require BOTH:
 *   --confirm-live
 *   --i-authorize-live-provider-calls
 * and will still STOP at preflight unless those flags are present.
 *
 * Never prints API key values. Never inserts leads/contacts.
 *
 * Examples:
 *   npx tsx scripts/run-discovery-benchmark.mts
 *   npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts --preflight
 *   npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts --mode=live_tavily --confirm-live --i-authorize-live-provider-calls
 *   npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts --mode=compare --confirm-live --i-authorize-live-provider-calls
 */
import Module from "node:module";

const originalLoad = (Module as unknown as { _load: Function })._load;
(Module as unknown as { _load: Function })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "server-only") return {};
  return originalLoad(request, parent, isMain);
};

function argValue(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function redact(s: string): string {
  return s
    .replace(/tvly-[A-Za-z0-9_-]+/gi, "[redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/gi, "[redacted]");
}

async function main() {
  const {
    buildDiscoveryBenchmarkPreflight,
    createMockDiscoverySearchClient,
    createTavilyBasicSearchClient,
    runDiscoveryBenchmark,
    DEFAULT_DISCOVERY_BENCHMARK_CEILINGS,
  } = await import("../src/lib/sourcing/search/discovery-benchmark/index.ts");
  const { createTavilyClient, getTavilyApiKey } = await import(
    "../src/lib/sourcing/search/providers/tavily.ts"
  );
  const { DEFAULT_BUYING_PROFILE } = await import("../src/types/sourcing.ts");

  const modeArg = (argValue("mode") || "mock") as "mock" | "live_tavily" | "compare";
  const mode =
    modeArg === "live_tavily" || modeArg === "compare" || modeArg === "mock"
      ? modeArg
      : "mock";
  const confirmLive = hasFlag("confirm-live");
  const authorize = hasFlag("i-authorize-live-provider-calls");
  const preflightOnly = hasFlag("preflight");
  const wantLive = mode === "live_tavily" || mode === "compare";

  const tavilyKeyPresent = Boolean(getTavilyApiKey() || process.env.TAVILY_API_KEY?.trim());
  const openAiKeyPresent = Boolean(process.env.OPENAI_API_KEY?.trim());

  const ceilings = { ...DEFAULT_DISCOVERY_BENCHMARK_CEILINGS };
  const preflight = buildDiscoveryBenchmarkPreflight({
    mode,
    tavilyKeyPresent,
    openAiKeyPresent,
    ceilings,
    profile: DEFAULT_BUYING_PROFILE,
  });

  console.log("=== SKL discovery benchmark (read-only) ===");
  console.log(
    JSON.stringify(
      {
        resolvedProvider: preflight.resolvedProvider,
        tavilyKeyPresent: preflight.tavilyKeyPresent,
        openAiKeyPresent: preflight.openAiKeyPresent,
        exactQueryCount: preflight.exactQueryCount,
        maxTavilyCredits: preflight.maxTavilyCredits,
        openaiWillBeCalled: preflight.openaiWillBeCalled,
        dbWrites: preflight.dbWrites,
        tavilyExtract: preflight.tavilyExtract,
        estimatedMaxCostUsd: preflight.estimatedMaxCostUsd,
        queryIds: preflight.queryIds,
        ceilings,
      },
      null,
      2
    )
  );

  if (preflightOnly && !wantLive) {
    // Mock can still run after preflight when not --preflight-only with live
  }

  if (preflightOnly && wantLive) {
    console.log(
      "\nPREFLIGHT ONLY — no live provider calls. Re-run with --confirm-live --i-authorize-live-provider-calls to execute (after explicit authorization)."
    );
    process.exit(0);
  }

  if (wantLive && (!confirmLive || !authorize)) {
    console.log("\n--- LIVE RUN BLOCKED ---");
    console.log("Resolved provider:", preflight.resolvedProvider);
    console.log("TAVILY_API_KEY:", tavilyKeyPresent ? "present" : "missing");
    console.log("OPENAI_API_KEY:", openAiKeyPresent ? "present" : "missing");
    console.log("Exact query count:", preflight.exactQueryCount);
    console.log("Maximum Tavily credits:", preflight.maxTavilyCredits);
    console.log("OpenAI will be called:", preflight.openaiWillBeCalled);
    console.log("DB writes disabled:", true);
    console.log("Estimated maximum cost (USD):", preflight.estimatedMaxCostUsd);
    console.log(
      "\nNo live Tavily/OpenAI call was made. To authorize a single controlled run after explicit approval:"
    );
    console.log(
      "  npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts --mode=live_tavily --confirm-live --i-authorize-live-provider-calls"
    );
    console.log(
      "  npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts --mode=compare --confirm-live --i-authorize-live-provider-calls"
    );
    process.exit(0);
  }

  if (mode === "mock") {
    const report = await runDiscoveryBenchmark({
      mode: "mock",
      allowLiveNetwork: false,
      tavilyClient: createMockDiscoverySearchClient(),
      ceilings,
    });
    printReport(report);
    process.exit(0);
  }

  if (mode === "live_tavily") {
    if (!tavilyKeyPresent) {
      console.error("TAVILY_API_KEY missing — aborting.");
      process.exit(2);
    }
    const apiKey = getTavilyApiKey()!;
    const sdk = createTavilyClient(apiKey);
    const tavilyClient = createTavilyBasicSearchClient({
      search: (q, opts) => sdk.search(q, opts),
    });
    const report = await runDiscoveryBenchmark({
      mode: "live_tavily",
      allowLiveNetwork: true,
      tavilyClient,
      ceilings,
    });
    printReport(report);
    process.exit(0);
  }

  // compare: Tavily discovery + existing OpenAI discovery (one controlled run each)
  if (!tavilyKeyPresent || !openAiKeyPresent) {
    console.error("compare requires both TAVILY_API_KEY and OPENAI_API_KEY — aborting.");
    process.exit(2);
  }
  const apiKey = getTavilyApiKey()!;
  const sdk = createTavilyClient(apiKey);
  const tavilyClient = createTavilyBasicSearchClient({
    search: (q, opts) => sdk.search(q, opts),
  });

  const { runOpenAiProviderSearch } = await import(
    "../src/lib/sourcing/search/providers/openai.ts"
  );

  const report = await runDiscoveryBenchmark({
    mode: "compare",
    allowLiveNetwork: true,
    tavilyClient,
    ceilings,
    openAiDiscovery: async () => {
      const result = await runOpenAiProviderSearch(DEFAULT_BUYING_PROFILE);
      const urls = result.payload.trucks.map((t) => t.listingUrl).filter(Boolean);
      return {
        urls,
        toolCalls: result.usage.webSearchCalls ?? result.usage.searchesRun ?? 1,
        estimatedCostUsd: result.usage.estimatedCostUsd ?? 0,
      };
    },
  });
  printReport(report);
}

function printReport(report: {
  mode: string;
  generatedAt: string;
  dbWrites: boolean;
  openaiCalled: boolean;
  tavilyExtractCalled: boolean;
  ceilings: unknown;
  queryPlans: Array<{ id: string; query: string; purpose: string }>;
  tavily: null | {
    provider: string;
    queriesRun: number;
    totalResultUrls: number;
    uniqueUrls: number;
    byBucket: Record<string, number>;
    duplicateRawHits: number;
    domains: string[];
    creditsOrToolCalls: number;
    estimatedCostUsd: number;
    retained: Array<{ canonicalUrl: string; bucket: string; provenance: unknown[] }>;
    rejectedUnsafe: unknown[];
  };
  openai: null | {
    provider: string;
    queriesRun: number;
    totalResultUrls: number;
    uniqueUrls: number;
    byBucket: Record<string, number>;
    duplicateRawHits: number;
    domains: string[];
    creditsOrToolCalls: number;
    estimatedCostUsd: number;
    retained: Array<{ canonicalUrl: string; bucket: string }>;
  };
  comparison: unknown;
  notes: string[];
}) {
  console.log("\n--- Report summary ---");
  const t = report.tavily;
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        generatedAt: report.generatedAt,
        dbWrites: report.dbWrites,
        openaiCalled: report.openaiCalled,
        tavilyExtractCalled: report.tavilyExtractCalled,
        queryCount: report.queryPlans.length,
        tavily: t
          ? {
              queriesRun: t.queriesRun,
              totalResultUrls: t.totalResultUrls,
              uniqueUrls: t.uniqueUrls,
              byBucket: t.byBucket,
              duplicateRawHits: t.duplicateRawHits,
              domains: t.domains,
              creditsOrToolCalls: t.creditsOrToolCalls,
              estimatedCostUsd: t.estimatedCostUsd,
              retainedListingUrls: t.retained.map((r) => ({
                url: r.canonicalUrl,
                bucket: r.bucket,
                provenanceCount: r.provenance.length,
              })),
              rejectedUnsafeCount: t.rejectedUnsafe.length,
            }
          : null,
        openai: report.openai
          ? {
              queriesRun: report.openai.queriesRun,
              totalResultUrls: report.openai.totalResultUrls,
              uniqueUrls: report.openai.uniqueUrls,
              byBucket: report.openai.byBucket,
              domains: report.openai.domains,
              creditsOrToolCalls: report.openai.creditsOrToolCalls,
              estimatedCostUsd: report.openai.estimatedCostUsd,
              retainedListingUrls: report.openai.retained.map((r) => r.canonicalUrl),
            }
          : null,
        comparison: report.comparison,
        notes: report.notes,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(redact(msg));
  process.exit(1);
});
