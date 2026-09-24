/**
 * Read-only discovery benchmark CLI (staff/local only).
 *
 * Default: mock (zero network, zero DB writes, zero OpenAI).
 *
 * Live / compare require BOTH:
 *   --confirm-live
 *   --i-authorize-live-provider-calls
 *
 * Never prints API key values, unsafe raw URLs, or credential-like query strings.
 * Never inserts leads/contacts.
 *
 * Examples:
 *   npx tsx scripts/run-discovery-benchmark.mts
 *   npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts --preflight
 *   npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts --mode=live_tavily --confirm-live --i-authorize-live-provider-calls
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
    DISCOVERY_BENCHMARK_SUCCESS_THRESHOLD,
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
        queries: preflight.queries,
        successThreshold: DISCOVERY_BENCHMARK_SUCCESS_THRESHOLD,
        ceilings,
      },
      null,
      2
    )
  );

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
    console.log("\nQueries that would run:");
    for (const q of preflight.queries) {
      console.log(`  [${q.id}] ${q.query}`);
    }
    console.log(
      "\nNo live Tavily/OpenAI call was made. To authorize a single controlled run after explicit approval:"
    );
    console.log(
      "  npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts --mode=live_tavily --confirm-live --i-authorize-live-provider-calls"
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
    metrics: {
      rawResultUrls: number;
      uniqueCanonicalUrlsAllBuckets: number;
      uniqueIndividualUrls: number;
      uniqueLikelyUrls: number;
      uniqueHubUrls: number;
      uniqueUnsafeUrls: number;
      retainedUrls: number;
      duplicateRawHits: number;
      retentionCapDrops: number;
    };
    byBucket: Record<string, number>;
    domains: string[];
    creditsOrToolCalls: number;
    estimatedCostUsd: number;
    retained: Array<{
      canonicalUrl: string;
      bucket: string;
      title?: string;
      provenance: Array<{
        queryId: string;
        query: string;
        title?: string;
      }>;
    }>;
    rejectedUnsafeCount: number;
  };
  openai: null | {
    provider: string;
    queriesRun: number;
    metrics: Record<string, number>;
    byBucket: Record<string, number>;
    domains: string[];
    creditsOrToolCalls: number;
    estimatedCostUsd: number;
    retained: Array<{ canonicalUrl: string; bucket: string }>;
    rejectedUnsafeCount: number;
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
              metrics: t.metrics,
              byBucketRawHits: t.byBucket,
              domains: t.domains,
              creditsOrToolCalls: t.creditsOrToolCalls,
              estimatedCostUsd: t.estimatedCostUsd,
              rejectedUnsafeCount: t.rejectedUnsafeCount,
              retained: t.retained.map((r) => ({
                canonicalUrl: r.canonicalUrl,
                bucket: r.bucket,
                title: r.title ?? null,
                provenance: r.provenance.map((p) => ({
                  queryId: p.queryId,
                  query: p.query,
                  title: p.title ?? null,
                })),
              })),
            }
          : null,
        openai: report.openai
          ? {
              queriesRun: report.openai.queriesRun,
              metrics: report.openai.metrics,
              byBucketRawHits: report.openai.byBucket,
              domains: report.openai.domains,
              creditsOrToolCalls: report.openai.creditsOrToolCalls,
              estimatedCostUsd: report.openai.estimatedCostUsd,
              retainedCanonicalUrls: report.openai.retained.map((r) => r.canonicalUrl),
              rejectedUnsafeCount: report.openai.rejectedUnsafeCount,
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
