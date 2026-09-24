import type { DiscoveryQueryPlan } from "@/lib/sourcing/search/discovery/query-matrix";
import type {
  DiscoveryUrlBucket,
  DiscoveryUrlClassification,
} from "@/lib/sourcing/search/discovery/url-classify";
import {
  DEFAULT_DISCOVERY_INSPECT_CEILINGS,
  type DiscoveryInspectCeilings,
} from "@/lib/sourcing/search/discovery/ceilings";

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

export type DiscoveryBenchmarkCeilings = Pick<
  DiscoveryInspectCeilings,
  "maxQueries" | "maxResultsPerQuery" | "maxRetainedListingUrls" | "maxTavilyCredits"
>;

export const DEFAULT_DISCOVERY_BENCHMARK_CEILINGS: DiscoveryBenchmarkCeilings = {
  maxQueries: DEFAULT_DISCOVERY_INSPECT_CEILINGS.maxQueries,
  maxResultsPerQuery: DEFAULT_DISCOVERY_INSPECT_CEILINGS.maxResultsPerQuery,
  maxRetainedListingUrls: DEFAULT_DISCOVERY_INSPECT_CEILINGS.maxRetainedListingUrls,
  maxTavilyCredits: DEFAULT_DISCOVERY_INSPECT_CEILINGS.maxTavilyCredits,
};

export type DiscoveryUrlMetrics = {
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

export type { DiscoveryQueryPlan, DiscoveryUrlBucket, DiscoveryUrlClassification };
