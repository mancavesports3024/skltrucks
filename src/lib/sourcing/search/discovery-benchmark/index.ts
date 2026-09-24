export {
  buildDiscoveryQueryMatrix,
  discoveryQueriesAreRelaxed,
  discoveryQueriesPreferUnitPages,
  listKnownDiscoveryDomains,
  JOINT_RADIUS_STATES,
  DEFAULT_DISCOVERY_QUERY_CEILING,
  type DiscoveryQueryPlan,
  type DiscoveryQueryPurpose,
} from "@/lib/sourcing/search/discovery-benchmark/query-matrix";
export {
  classifyDiscoveryUrl,
  detectDiscoveryHub,
  detectPositiveUnitEvidence,
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
  type DiscoveryUrlMetrics,
} from "@/lib/sourcing/search/discovery-benchmark/types";
export {
  FIRST_RUN_RETAINED_URL_FIXTURES,
  PROVEN_UNIT_VDP_FIXTURES,
  AMBIGUOUS_UNIT_FIXTURES,
} from "@/lib/sourcing/search/discovery-benchmark/first-run-fixtures";
export {
  DISCOVERY_BENCHMARK_SUCCESS_THRESHOLD,
  evaluateDiscoveryBenchmarkSuccess,
} from "@/lib/sourcing/search/discovery-benchmark/success-threshold";
