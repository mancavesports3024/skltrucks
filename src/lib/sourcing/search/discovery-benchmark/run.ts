import {
  buildDiscoveryQueryMatrix,
  type DiscoveryQueryPlan,
} from "@/lib/sourcing/search/discovery-benchmark/query-matrix";
import { classifyDiscoveryUrl } from "@/lib/sourcing/search/discovery-benchmark/url-classify";
import type {
  DiscoveryBenchmarkCeilings,
  DiscoveryBenchmarkMode,
  DiscoveryBenchmarkReport,
  DiscoveryProviderStats,
  DiscoverySearchClient,
  DiscoverySearchHit,
  RetainedDiscoveryUrl,
} from "@/lib/sourcing/search/discovery-benchmark/types";
import { DEFAULT_DISCOVERY_BENCHMARK_CEILINGS } from "@/lib/sourcing/search/discovery-benchmark/types";
import { estimateTavilyCostUsd } from "@/lib/sourcing/search/types";
import type { BuyingProfile } from "@/types/sourcing";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

/** Social / non-dealer hosts already excluded by the production Tavily pilot. */
const DEFAULT_EXCLUDE_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "reddit.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "c-span.org",
  "wikipedia.org",
] as const;

const EMPTY_BUCKETS = (): DiscoveryProviderStats["byBucket"] => ({
  individual_listing: 0,
  likely_listing_needs_inspection: 0,
  hub_or_category: 0,
  unsupported_or_unsafe: 0,
});

function usableListingCount(stats: DiscoveryProviderStats): number {
  return stats.byBucket.individual_listing + stats.byBucket.likely_listing_needs_inspection;
}

/**
 * Live Tavily basic-search-only client (no extract).
 * Caller must pass an already-constructed TavilyClientLike.search binder —
 * this keeps server-only / SDK imports out of the pure benchmark core.
 */
export function createTavilyBasicSearchClient(args: {
  search: (
    query: string,
    options?: Record<string, unknown>
  ) => Promise<{ results?: Array<{ url?: string; title?: string; content?: string }>; usage?: { credits?: number } }>;
}): DiscoverySearchClient {
  return {
    async search(query, options) {
      const response = await args.search(query, {
        searchDepth: "basic",
        maxResults: options?.maxResults ?? 10,
        includeAnswer: false,
        includeRawContent: false,
        includeImages: false,
        includeUsage: true,
        excludeDomains: [...DEFAULT_EXCLUDE_DOMAINS],
        ...(options?.includeDomains?.length
          ? { includeDomains: options.includeDomains }
          : {}),
      });
      const reported = Number(response.usage?.credits);
      const creditsCharged =
        Number.isFinite(reported) && reported > 0 ? reported : 1;
      const results: DiscoverySearchHit[] = (response.results ?? [])
        .map((r) => ({
          url: String(r.url ?? "").trim(),
          title: r.title ? String(r.title) : undefined,
          content: r.content ? String(r.content) : undefined,
        }))
        .filter((r) => r.url);
      return { results, creditsCharged };
    },
  };
}

/**
 * Mock Tavily-like client: deterministic URLs per query id keyword.
 * Zero network. Safe for CI.
 */
export function createMockDiscoverySearchClient(): DiscoverySearchClient {
  return {
    async search(query, options) {
      const max = options?.maxResults ?? 10;
      const q = query.toLowerCase();
      const hits: DiscoverySearchHit[] = [];
      if (q.includes("freightliner")) {
        hits.push({
          url: "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001",
          title: "2019 Freightliner M2 box",
        });
        hits.push({
          url: "https://www.commercialtrucktrader.com/trucks-for-sale",
          title: "Hub",
        });
      }
      if (q.includes("international")) {
        hits.push({
          url: "https://www.mylittlesalesman.com/inventory/used-2020-international-mv-26ft-8002",
          title: "2020 International MV",
        });
      }
      if (q.includes("kenworth")) {
        hits.push({
          url: "https://www.example-dealer.com/inventory/used-2018-kenworth-t270-box-7003",
          title: "2018 Kenworth T270",
        });
      }
      if (q.includes("26 foot") || q.includes("26'")) {
        hits.push({
          url: "https://www.debarytrucksales.com/inventory/used-2021-freightliner-m2-26ft-9004",
          title: "26ft box",
        });
      }
      if (q.includes("missouri") || q.includes("kansas")) {
        hits.push({
          url: "https://www.truckandvanoutlet.com/inventory/used-2019-freightliner-box-missouri-5001",
          title: "Regional listing",
        });
      }
      // Unsafe / session-shaped — must be rejected by classifier
      hits.push({
        url: "https://evil.example/listing?session=abc&token=secret",
        title: "unsafe",
      });
      hits.push({
        url: "https://user:pass@dealer.example/inventory/unit-1",
        title: "userinfo",
      });
      // Dedup pressure
      if (hits[0]) hits.push({ ...hits[0], title: "dup" });
      return { results: hits.slice(0, max), creditsCharged: 1 };
    },
  };
}

export type RunDiscoveryBenchmarkInput = {
  profile?: BuyingProfile;
  mode: DiscoveryBenchmarkMode;
  ceilings?: Partial<DiscoveryBenchmarkCeilings>;
  /** Injected client for mock/tests/live. */
  tavilyClient?: DiscoverySearchClient;
  /** Optional OpenAI discovery URL fetcher for compare mode (tests inject). */
  openAiDiscovery?: () => Promise<{ urls: string[]; toolCalls: number; estimatedCostUsd: number }>;
  /** When false (default), live network clients must not be used. */
  allowLiveNetwork?: boolean;
};

/**
 * Read-only discovery benchmark.
 * - Never writes leads/contacts/DB
 * - Never calls Tavily extract
 * - Never calls OpenAI unless mode=compare and openAiDiscovery is provided
 */
export async function runDiscoveryBenchmark(
  input: RunDiscoveryBenchmarkInput
): Promise<DiscoveryBenchmarkReport> {
  const profile = input.profile ?? DEFAULT_BUYING_PROFILE;
  const ceilings: DiscoveryBenchmarkCeilings = {
    ...DEFAULT_DISCOVERY_BENCHMARK_CEILINGS,
    ...input.ceilings,
  };
  const plans = buildDiscoveryQueryMatrix(profile, {
    maxQueries: ceilings.maxQueries,
    includeDomainTargeted: true,
  });

  const notes: string[] = [
    "Discovery finds plausible URLs; confirmation requires page inspection/classification.",
    "U.S.-only, GVWR, mileage, and distance remain inspection/classification rules.",
    "DB writes are disabled for this benchmark.",
    "Tavily extract is disabled (basic search only).",
  ];

  if (input.mode === "live_tavily" && !input.allowLiveNetwork) {
    throw new Error(
      "REFUSE: live_tavily requires allowLiveNetwork=true and explicit operator authorization."
    );
  }
  if (input.mode === "compare" && !input.allowLiveNetwork && !input.openAiDiscovery) {
    throw new Error(
      "REFUSE: compare without injected openAiDiscovery requires allowLiveNetwork + authorization."
    );
  }

  const client =
    input.tavilyClient ??
    (input.mode === "mock" || !input.allowLiveNetwork
      ? createMockDiscoverySearchClient()
      : null);
  if (!client) {
    throw new Error("REFUSE: no Tavily discovery client (inject mock or authorize live).");
  }

  const tavily = await runProviderDiscovery({
    provider: input.mode === "mock" ? "mock" : "tavily",
    plans,
    ceilings,
    client,
  });

  let openai: DiscoveryProviderStats | null = null;
  let openaiCalled = false;
  if (input.mode === "compare" && input.openAiDiscovery) {
    openaiCalled = true;
    const oa = await input.openAiDiscovery();
    openai = foldUrlListToStats("openai", oa.urls, oa.toolCalls, oa.estimatedCostUsd, ceilings);
  }

  const comparison =
    tavily && openai
      ? buildComparison(tavily, openai)
      : null;

  return {
    mode: input.mode,
    generatedAt: new Date().toISOString(),
    dbWrites: false,
    openaiCalled,
    tavilyExtractCalled: false,
    ceilings,
    queryPlans: plans,
    tavily,
    openai,
    comparison,
    notes,
  };
}

async function runProviderDiscovery(args: {
  provider: "tavily" | "mock";
  plans: DiscoveryQueryPlan[];
  ceilings: DiscoveryBenchmarkCeilings;
  client: DiscoverySearchClient;
}): Promise<DiscoveryProviderStats> {
  const { provider, plans, ceilings, client } = args;
  const byCanonical = new Map<string, RetainedDiscoveryUrl>();
  const rejectedUnsafe: DiscoveryProviderStats["rejectedUnsafe"] = [];
  const byBucket = EMPTY_BUCKETS();
  let totalResultUrls = 0;
  let duplicateRawHits = 0;
  let credits = 0;
  let queriesRun = 0;
  const domains = new Set<string>();

  for (const plan of plans) {
    if (credits >= ceilings.maxTavilyCredits) break;
    if (queriesRun >= ceilings.maxQueries) break;
    const res = await client.search(plan.query, {
      maxResults: ceilings.maxResultsPerQuery,
      includeDomains: plan.includeDomains,
      searchDepth: "basic",
    });
    const charged = res.creditsCharged || 1;
    if (credits + charged > ceilings.maxTavilyCredits) break;
    credits += charged;
    queriesRun += 1;

    for (const hit of res.results) {
      totalResultUrls += 1;
      const classified = classifyDiscoveryUrl(hit.url);
      byBucket[classified.bucket] += 1;
      if (classified.hostname) domains.add(classified.hostname);

      if (classified.bucket === "unsupported_or_unsafe") {
        rejectedUnsafe.push(classified);
        continue;
      }

      if (
        classified.bucket === "hub_or_category" ||
        !classified.canonicalUrl
      ) {
        continue;
      }

      // Retain only individual + likely listing URLs, capped
      const isRetainable =
        classified.bucket === "individual_listing" ||
        classified.bucket === "likely_listing_needs_inspection";
      if (!isRetainable) continue;

      const existing = byCanonical.get(classified.canonicalUrl);
      if (existing) {
        duplicateRawHits += 1;
        existing.provenance.push({
          queryId: plan.id,
          query: plan.query,
          rawUrl: hit.url,
          title: hit.title,
        });
        continue;
      }

      if (byCanonical.size >= ceilings.maxRetainedListingUrls) continue;

      byCanonical.set(classified.canonicalUrl, {
        ...classified,
        title: hit.title,
        provenance: [
          {
            queryId: plan.id,
            query: plan.query,
            rawUrl: hit.url,
            title: hit.title,
          },
        ],
      });
    }
  }

  const retained = [...byCanonical.values()];
  return {
    provider,
    queriesRun,
    totalResultUrls,
    uniqueUrls: new Set(
      [...retained.map((r) => r.canonicalUrl), ...rejectedUnsafe.map((r) => r.canonicalUrl)].filter(
        Boolean
      )
    ).size,
    byBucket,
    duplicateRawHits,
    domains: [...domains].sort(),
    creditsOrToolCalls: credits,
    estimatedCostUsd: estimateTavilyCostUsd(credits),
    retained,
    rejectedUnsafe,
  };
}

function foldUrlListToStats(
  provider: "openai",
  urls: string[],
  toolCalls: number,
  estimatedCostUsd: number,
  ceilings: DiscoveryBenchmarkCeilings
): DiscoveryProviderStats {
  const byBucket = EMPTY_BUCKETS();
  const byCanonical = new Map<string, RetainedDiscoveryUrl>();
  const rejectedUnsafe: DiscoveryProviderStats["rejectedUnsafe"] = [];
  const domains = new Set<string>();
  let duplicateRawHits = 0;

  for (const url of urls) {
    const classified = classifyDiscoveryUrl(url);
    byBucket[classified.bucket] += 1;
    if (classified.hostname) domains.add(classified.hostname);
    if (classified.bucket === "unsupported_or_unsafe") {
      rejectedUnsafe.push(classified);
      continue;
    }
    if (
      classified.bucket !== "individual_listing" &&
      classified.bucket !== "likely_listing_needs_inspection"
    ) {
      continue;
    }
    if (!classified.canonicalUrl) continue;
    if (byCanonical.has(classified.canonicalUrl)) {
      duplicateRawHits += 1;
      continue;
    }
    if (byCanonical.size >= ceilings.maxRetainedListingUrls) continue;
    byCanonical.set(classified.canonicalUrl, {
      ...classified,
      provenance: [{ queryId: "openai-discovery", query: "openai-discovery", rawUrl: url }],
    });
  }

  return {
    provider,
    queriesRun: toolCalls,
    totalResultUrls: urls.length,
    uniqueUrls: byCanonical.size + rejectedUnsafe.length,
    byBucket,
    duplicateRawHits,
    domains: [...domains].sort(),
    creditsOrToolCalls: toolCalls,
    estimatedCostUsd,
    retained: [...byCanonical.values()],
    rejectedUnsafe,
  };
}

function buildComparison(tavily: DiscoveryProviderStats, openai: DiscoveryProviderStats) {
  const tSet = new Set(tavily.retained.map((r) => r.canonicalUrl));
  const oSet = new Set(openai.retained.map((r) => r.canonicalUrl));
  const overlap = [...tSet].filter((u) => oSet.has(u));
  const tOnly = [...tSet].filter((u) => !oSet.has(u));
  const oOnly = [...oSet].filter((u) => !tSet.has(u));
  const tUsable = usableListingCount(tavily);
  const oUsable = usableListingCount(openai);
  return {
    tavilyOnlyCanonical: tOnly,
    openaiOnlyCanonical: oOnly,
    overlapCanonical: overlap,
    costPerUsableListingTavily:
      tUsable > 0 ? tavily.estimatedCostUsd / tUsable : null,
    costPerUsableListingOpenAi:
      oUsable > 0 ? openai.estimatedCostUsd / oUsable : null,
  };
}

/** Preflight summary for operator confirmation — never includes API key values. */
export function buildDiscoveryBenchmarkPreflight(args: {
  mode: DiscoveryBenchmarkMode;
  tavilyKeyPresent: boolean;
  openAiKeyPresent: boolean;
  ceilings?: Partial<DiscoveryBenchmarkCeilings>;
  profile?: BuyingProfile;
}): {
  resolvedProvider: string;
  tavilyKeyPresent: boolean;
  openAiKeyPresent: boolean;
  exactQueryCount: number;
  maxTavilyCredits: number;
  openaiWillBeCalled: boolean;
  dbWrites: false;
  tavilyExtract: false;
  estimatedMaxCostUsd: number;
  queryIds: string[];
} {
  const ceilings = { ...DEFAULT_DISCOVERY_BENCHMARK_CEILINGS, ...args.ceilings };
  const plans = buildDiscoveryQueryMatrix(args.profile ?? DEFAULT_BUYING_PROFILE, {
    maxQueries: ceilings.maxQueries,
  });
  const openaiWillBeCalled = args.mode === "compare";
  return {
    resolvedProvider:
      args.mode === "mock"
        ? "mock"
        : args.mode === "compare"
          ? "tavily+openai"
          : "tavily",
    tavilyKeyPresent: args.tavilyKeyPresent,
    openAiKeyPresent: args.openAiKeyPresent,
    exactQueryCount: plans.length,
    maxTavilyCredits: ceilings.maxTavilyCredits,
    openaiWillBeCalled,
    dbWrites: false,
    tavilyExtract: false,
    estimatedMaxCostUsd: estimateTavilyCostUsd(ceilings.maxTavilyCredits),
    queryIds: plans.map((p) => p.id),
  };
}
