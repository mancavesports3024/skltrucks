export {
  buildDiscoveryQueryMatrix,
  discoveryQueriesAreRelaxed,
  listKnownDiscoveryDomains,
  JOINT_RADIUS_STATES,
  DEFAULT_DISCOVERY_QUERY_CEILING,
  type DiscoveryQueryPlan,
  type DiscoveryQueryPurpose,
} from "@/lib/sourcing/search/discovery-benchmark/query-matrix";
export {
  classifyDiscoveryUrl,
  type DiscoveryUrlBucket,
  type DiscoveryUrlClassification,
} from "@/lib/sourcing/search/discovery-benchmark/url-classify";
export {
  runDiscoveryBenchmark,
  createMockDiscoverySearchClient,
  createTavilyBasicSearchClient,
  buildDiscoveryBenchmarkPreflight,
  type RunDiscoveryBenchmarkInput,
} from "@/lib/sourcing/search/discovery-benchmark/run";
export {
  DEFAULT_DISCOVERY_BENCHMARK_CEILINGS,
  type DiscoveryBenchmarkCeilings,
  type DiscoveryBenchmarkMode,
  type DiscoveryBenchmarkReport,
  type DiscoveryProviderStats,
} from "@/lib/sourcing/search/discovery-benchmark/types";
