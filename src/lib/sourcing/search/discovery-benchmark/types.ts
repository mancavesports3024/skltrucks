import type { DiscoveryQueryPlan } from "@/lib/sourcing/search/discovery/query-matrix";
import type {
  DiscoveryBenchmarkCeilings,
  DiscoverySearchClient,
  DiscoveryUrlMetrics,
  RetainedDiscoveryUrl,
} from "@/lib/sourcing/search/discovery/types";
import { DEFAULT_DISCOVERY_BENCHMARK_CEILINGS } from "@/lib/sourcing/search/discovery/types";
import type { DiscoveryUrlBucket, DiscoveryUrlClassification } from "@/lib/sourcing/search/discovery/url-classify";

export type DiscoveryBenchmarkMode = "mock" | "live_tavily" | "compare";

export type DiscoveryProviderStats = {
  provider: "tavily" | "openai" | "mock";
  queriesRun: number;
  totalResultUrls: number;
  uniqueUrls: number;
  metrics: DiscoveryUrlMetrics;
  byBucket: Record<DiscoveryUrlBucket, number>;
  duplicateRawHits: number;
  domains: string[];
  creditsOrToolCalls: number;
  estimatedCostUsd: number;
  retained: RetainedDiscoveryUrl[];
  rejectedUnsafeCount: number;
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

export type {
  DiscoveryBenchmarkCeilings,
  DiscoverySearchClient,
  DiscoveryUrlMetrics,
  RetainedDiscoveryUrl,
  DiscoveryUrlClassification,
};
export { DEFAULT_DISCOVERY_BENCHMARK_CEILINGS };
