/**
 * Cost estimates for Penske inspect-only runs (OpenAI web_search published rate).
 * No live calls — used for UI confirmation and reporting.
 */
import { estimateOpenAiSearchCostUsd } from "@/lib/sourcing/search/types";

/** Published OpenAI web_search list price used elsewhere in the pilot ($/call). */
export const PENSKE_INSPECT_WEB_SEARCH_USD = 0.01;

/**
 * Conservative maximum estimate shown before staff confirms.
 * Assumes one web_search call per URL + modest token ceiling per inspect.
 */
export function estimatePenskeInspectionMaxCostUsd(urlCount: number): number {
  const n = Math.max(0, Math.min(10, Math.floor(urlCount)));
  if (n === 0) return 0;
  // Worst-case tokens per inspect (input+output) padded for confirmation UI
  return estimateOpenAiSearchCostUsd({
    webSearchCalls: n,
    inputTokens: n * 4_000,
    outputTokens: n * 1_500,
  });
}

export function formatPenskeInspectionMaxCostUsd(urlCount: number): string {
  return `$${estimatePenskeInspectionMaxCostUsd(urlCount).toFixed(2)}`;
}
