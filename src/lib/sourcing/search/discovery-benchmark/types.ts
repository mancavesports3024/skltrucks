import type { DiscoveryQueryPlan } from "@/lib/sourcing/search/discovery-benchmark/query-matrix";
import type {
  DiscoveryUrlBucket,
  DiscoveryUrlClassification,
} from "@/lib/sourcing/search/discovery-benchmark/url-classify";

export type DiscoveryHitProvenance = {
  queryId: string;
  query: string;
  rawUrl: string;
  title?: string;
};

export type RetainedDiscoveryUrl = DiscoveryUrlClassification & {
  provenance: DiscoveryHitProvenance[];
  title?: string;
};

export type DiscoveryBenchmarkCeilings = {
  maxQueries: number;
  maxResultsPerQuery: number;
  maxRetainedListingUrls: number;
  /** Tavily basic search credits (1 per search). Discovery-only: no extract. */
  maxTavilyCredits: number;
};

export const DEFAULT_DISCOVERY_BENCHMARK_CEILINGS: DiscoveryBenchmarkCeilings = {
  maxQueries: 12,
  maxResultsPerQuery: 10,
  maxRetainedListingUrls: 20,
  maxTavilyCredits: 12,
};

export type DiscoveryBenchmarkMode = "mock" | "live_tavily" | "compare";

export type DiscoveryProviderStats = {
  provider: "tavily" | "openai" | "mock";
  queriesRun: number;
  totalResultUrls: number;
  uniqueUrls: number;
  byBucket: Record<DiscoveryUrlBucket, number>;
  duplicateRawHits: number;
  domains: string[];
  creditsOrToolCalls: number;
  estimatedCostUsd: number;
  retained: RetainedDiscoveryUrl[];
  rejectedUnsafe: DiscoveryUrlClassification[];
};

export type DiscoveryBenchmarkReport = {
  mode: DiscoveryBenchmarkMode;
  generatedAt: string;
  dbWrites: false;
  openaiCalled: boolean;
  tavilyExtractCalled: boolean;
  ceilings: DiscoveryBenchmarkCeilings;
  queryPlans: DiscoveryQueryPlan[];
  tavily: DiscoveryProviderStats | null;
  openai: DiscoveryProviderStats | null;
  comparison: {
    tavilyOnlyCanonical: string[];
    openaiOnlyCanonical: string[];
    overlapCanonical: string[];
    costPerUsableListingTavily: number | null;
    costPerUsableListingOpenAi: number | null;
  } | null;
  notes: string[];
};

export type DiscoverySearchHit = {
  url: string;
  title?: string;
  content?: string;
};

export type DiscoverySearchClient = {
  search: (
    query: string,
    options?: { maxResults?: number; includeDomains?: string[]; searchDepth?: string }
  ) => Promise<{ results: DiscoverySearchHit[]; creditsCharged: number }>;
};
