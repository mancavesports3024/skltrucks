export {
  buildDiscoveryQueryMatrix,
  discoveryQueriesAreRelaxed,
  discoveryQueriesPreferUnitPages,
  listKnownDiscoveryDomains,
  JOINT_RADIUS_STATES,
  DEFAULT_DISCOVERY_QUERY_CEILING,
  type DiscoveryQueryPlan,
  type DiscoveryQueryPurpose,
} from "@/lib/sourcing/search/discovery/query-matrix";
export {
  classifyDiscoveryUrl,
  detectDiscoveryHub,
  detectPositiveUnitEvidence,
  DISCOVERY_NOISE_HOST_SUFFIXES,
  type DiscoveryUrlBucket,
  type DiscoveryUrlClassification,
} from "@/lib/sourcing/search/discovery/url-classify";
export {
  DISCOVERY_MAX_QUERIES,
  DISCOVERY_MAX_TAVILY_CREDITS,
  DISCOVERY_MAX_RETAINED_URLS,
  DISCOVERY_INSPECT_MAX_CANDIDATES,
  DISCOVERY_INSPECT_MAX_OPENAI_CALLS,
  DEFAULT_DISCOVERY_INSPECT_CEILINGS,
  clampDiscoveryInspectCeilings,
  estimateDiscoveryTavilyMaxCostUsd,
  estimateDiscoveryOpenAiInspectMaxCostUsd,
  estimateDiscoveryInspectCombinedMaxCostUsd,
  type DiscoveryInspectCeilings,
} from "@/lib/sourcing/search/discovery/ceilings";
export {
  DEFAULT_DISCOVERY_BENCHMARK_CEILINGS,
  type DiscoveryHitProvenance,
  type RetainedDiscoveryUrl,
  type DiscoveryUrlMetrics,
  type DiscoverySearchHit,
  type DiscoverySearchClient,
  type DiscoveryBenchmarkCeilings,
} from "@/lib/sourcing/search/discovery/types";
