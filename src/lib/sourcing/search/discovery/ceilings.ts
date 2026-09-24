/**
 * Shared discovery ceilings and cost helpers (production + benchmark).
 * Server limits are authoritative — never trust client-supplied ceilings.
 */
import { estimateOpenAiSearchCostUsd, estimateTavilyCostUsd } from "@/lib/sourcing/search/types";

export const DISCOVERY_MAX_QUERIES = 12;
export const DISCOVERY_MAX_RESULTS_PER_QUERY = 10;
export const DISCOVERY_MAX_RETAINED_URLS = 20;
export const DISCOVERY_MAX_TAVILY_CREDITS = 12;
/** ~$0.008 / basic search credit. */
export const DISCOVERY_MAX_TAVILY_COST_USD = estimateTavilyCostUsd(DISCOVERY_MAX_TAVILY_CREDITS);

export const DISCOVERY_INSPECT_MAX_CANDIDATES = 10;
export const DISCOVERY_INSPECT_MAX_OPENAI_CALLS = 10;

export type DiscoveryInspectCeilings = {
  maxQueries: number;
  maxResultsPerQuery: number;
  maxRetainedListingUrls: number;
  maxTavilyCredits: number;
  maxInspectCandidates: number;
  maxOpenAiInspectCalls: number;
};

export const DEFAULT_DISCOVERY_INSPECT_CEILINGS: DiscoveryInspectCeilings = {
  maxQueries: DISCOVERY_MAX_QUERIES,
  maxResultsPerQuery: DISCOVERY_MAX_RESULTS_PER_QUERY,
  maxRetainedListingUrls: DISCOVERY_MAX_RETAINED_URLS,
  maxTavilyCredits: DISCOVERY_MAX_TAVILY_CREDITS,
  maxInspectCandidates: DISCOVERY_INSPECT_MAX_CANDIDATES,
  maxOpenAiInspectCalls: DISCOVERY_INSPECT_MAX_OPENAI_CALLS,
};

/** Clamp client-supplied ceilings to server maxima (never raise above defaults). */
export function clampDiscoveryInspectCeilings(
  partial?: Partial<DiscoveryInspectCeilings>
): DiscoveryInspectCeilings {
  const base = DEFAULT_DISCOVERY_INSPECT_CEILINGS;
  const clamp = (n: number | undefined, max: number, min = 1) =>
    Math.max(min, Math.min(max, Number.isFinite(n as number) ? Math.floor(n as number) : max));
  return {
    maxQueries: clamp(partial?.maxQueries, base.maxQueries),
    maxResultsPerQuery: clamp(partial?.maxResultsPerQuery, base.maxResultsPerQuery),
    maxRetainedListingUrls: clamp(partial?.maxRetainedListingUrls, base.maxRetainedListingUrls),
    maxTavilyCredits: clamp(partial?.maxTavilyCredits, base.maxTavilyCredits),
    maxInspectCandidates: clamp(partial?.maxInspectCandidates, base.maxInspectCandidates),
    maxOpenAiInspectCalls: clamp(partial?.maxOpenAiInspectCalls, base.maxOpenAiInspectCalls, 0),
  };
}

export function estimateDiscoveryTavilyMaxCostUsd(credits = DISCOVERY_MAX_TAVILY_CREDITS): number {
  return estimateTavilyCostUsd(Math.min(credits, DISCOVERY_MAX_TAVILY_CREDITS));
}

export function estimateDiscoveryOpenAiInspectMaxCostUsd(
  calls = DISCOVERY_INSPECT_MAX_OPENAI_CALLS
): number {
  const n = Math.max(0, Math.min(DISCOVERY_INSPECT_MAX_OPENAI_CALLS, Math.floor(calls)));
  if (n === 0) return 0;
  return estimateOpenAiSearchCostUsd({
    webSearchCalls: n,
    inputTokens: n * 4_000,
    outputTokens: n * 1_500,
  });
}

export function estimateDiscoveryInspectCombinedMaxCostUsd(
  ceilings: DiscoveryInspectCeilings = DEFAULT_DISCOVERY_INSPECT_CEILINGS
): {
  tavilyMaxUsd: number;
  openAiMaxUsd: number;
  combinedMaxUsd: number;
} {
  const tavilyMaxUsd = estimateDiscoveryTavilyMaxCostUsd(ceilings.maxTavilyCredits);
  const openAiMaxUsd = estimateDiscoveryOpenAiInspectMaxCostUsd(ceilings.maxOpenAiInspectCalls);
  return {
    tavilyMaxUsd,
    openAiMaxUsd,
    combinedMaxUsd: Math.round((tavilyMaxUsd + openAiMaxUsd) * 10000) / 10000,
  };
}
