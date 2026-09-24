/**
 * Benchmark package: re-exports shared discovery + benchmark-only fixtures/CLI runners.
 * Production Preview imports from `@/lib/sourcing/search/discovery` and
 * `@/lib/sourcing/search/discovery-inspect` — not this folder — so fixtures/CLI
 * stay out of the runtime pathway.
 */
export {
  buildDiscoveryQueryMatrix,
  discoveryQueriesAreRelaxed,
  discoveryQueriesPreferUnitPages,
  listKnownDiscoveryDomains,
  JOINT_RADIUS_STATES,
  DEFAULT_DISCOVERY_QUERY_CEILING,
  classifyDiscoveryUrl,
  detectDiscoveryHub,
  detectPositiveUnitEvidence,
  DISCOVERY_NOISE_HOST_SUFFIXES,
  DEFAULT_DISCOVERY_BENCHMARK_CEILINGS,
  type DiscoveryQueryPlan,
  type DiscoveryQueryPurpose,
  type DiscoveryUrlBucket,
  type DiscoveryUrlClassification,
  type DiscoveryBenchmarkCeilings,
  type DiscoveryHitProvenance,
  type RetainedDiscoveryUrl,
  type DiscoveryUrlMetrics,
  type DiscoverySearchClient,
} from "@/lib/sourcing/search/discovery";

export {
  runDiscoveryBenchmark,
  createMockDiscoverySearchClient,
  createTavilyBasicSearchClient,
  buildDiscoveryBenchmarkPreflight,
  type RunDiscoveryBenchmarkInput,
} from "@/lib/sourcing/search/discovery-benchmark/run";

export type {
  DiscoveryBenchmarkMode,
  DiscoveryBenchmarkReport,
  DiscoveryProviderStats,
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
