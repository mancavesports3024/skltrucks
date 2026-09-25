/**
 * Second-run (and later) success threshold for the Tavily discovery benchmark.
 * If a live run misses this threshold, stop Tavily tuning or change providers —
 * do not repeatedly tune without evidence.
 */
export const DISCOVERY_BENCHMARK_SUCCESS_THRESHOLD = {
  /** At least this many retained URLs manually verified as true individual unit pages. */
  minVerifiedIndividualUnitPages: 5,
  /** At least this fraction of retained URLs are true individual unit pages. */
  minVerifiedIndividualShareOfRetained: 0.25,
  /** No known category/search URL may be classified as individual_listing. */
  allowKnownCategoryAsIndividual: false,
  /** No unsafe URL may be retained. */
  allowUnsafeRetained: false,
  /** Estimated Tavily cost ceiling (USD). */
  maxEstimatedCostUsd: 0.1,
  /** Hard zeros for side effects. */
  allowOpenAiCalls: false,
  allowTavilyExtract: false,
  allowDbWrites: false,
} as const;

export type DiscoveryBenchmarkSuccessEvaluation = {
  passed: boolean;
  failures: string[];
  metrics: {
    retainedCount: number;
    verifiedIndividualCount: number;
    verifiedShare: number | null;
    estimatedCostUsd: number;
    knownCategoryClassifiedIndividual: number;
    unsafeRetained: number;
    openaiCalled: boolean;
    tavilyExtractCalled: boolean;
    dbWrites: boolean;
  };
};

/**
 * Evaluate a live (or mock) report against the documented success threshold.
 * `verifiedIndividualCanonicalUrls` must come from manual review — never from snippets.
 */
export function evaluateDiscoveryBenchmarkSuccess(args: {
  retainedCanonicalUrls: string[];
  verifiedIndividualCanonicalUrls: string[];
  knownCategoryUrlsClassifiedIndividual: string[];
  unsafeRetainedCount: number;
  estimatedCostUsd: number;
  openaiCalled: boolean;
  tavilyExtractCalled: boolean;
  dbWrites: boolean;
  threshold?: typeof DISCOVERY_BENCHMARK_SUCCESS_THRESHOLD;
}): DiscoveryBenchmarkSuccessEvaluation {
  const t = args.threshold ?? DISCOVERY_BENCHMARK_SUCCESS_THRESHOLD;
  const retainedCount = args.retainedCanonicalUrls.length;
  const verifiedSet = new Set(args.verifiedIndividualCanonicalUrls);
  const verifiedIndividualCount = args.retainedCanonicalUrls.filter((u) =>
    verifiedSet.has(u)
  ).length;
  const verifiedShare =
    retainedCount > 0 ? verifiedIndividualCount / retainedCount : null;
  const failures: string[] = [];

  if (verifiedIndividualCount < t.minVerifiedIndividualUnitPages) {
    failures.push(
      `verified individual unit pages ${verifiedIndividualCount} < ${t.minVerifiedIndividualUnitPages}`
    );
  }
  if (
    verifiedShare == null ||
    verifiedShare < t.minVerifiedIndividualShareOfRetained
  ) {
    failures.push(
      `verified share ${verifiedShare ?? 0} < ${t.minVerifiedIndividualShareOfRetained}`
    );
  }
  if (
    !t.allowKnownCategoryAsIndividual &&
    args.knownCategoryUrlsClassifiedIndividual.length > 0
  ) {
    failures.push(
      `known category URLs classified individual_listing: ${args.knownCategoryUrlsClassifiedIndividual.length}`
    );
  }
  if (!t.allowUnsafeRetained && args.unsafeRetainedCount > 0) {
    failures.push(`unsafe URLs retained: ${args.unsafeRetainedCount}`);
  }
  if (args.estimatedCostUsd > t.maxEstimatedCostUsd) {
    failures.push(
      `estimated cost $${args.estimatedCostUsd} > $${t.maxEstimatedCostUsd}`
    );
  }
  if (!t.allowOpenAiCalls && args.openaiCalled) {
    failures.push("OpenAI was called");
  }
  if (!t.allowTavilyExtract && args.tavilyExtractCalled) {
    failures.push("Tavily extract was called");
  }
  if (!t.allowDbWrites && args.dbWrites) {
    failures.push("DB writes occurred");
  }

  return {
    passed: failures.length === 0,
    failures,
    metrics: {
      retainedCount,
      verifiedIndividualCount,
      verifiedShare,
      estimatedCostUsd: args.estimatedCostUsd,
      knownCategoryClassifiedIndividual:
        args.knownCategoryUrlsClassifiedIndividual.length,
      unsafeRetained: args.unsafeRetainedCount,
      openaiCalled: args.openaiCalled,
      tavilyExtractCalled: args.tavilyExtractCalled,
      dbWrites: args.dbWrites,
    },
  };
}
