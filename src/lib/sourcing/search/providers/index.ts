import "server-only";

import type { BuyingProfile } from "@/types/sourcing";
import { runMockSearch } from "@/lib/sourcing/search/providers/mock";
import { isOpenAiSearchConfigured, runOpenAiProvider } from "@/lib/sourcing/search/providers/openai";
import { isTavilyConfigured, runTavilyProvider } from "@/lib/sourcing/search/providers/tavily";
import type {
  SearchProviderOptions,
  SearchProviderResult,
} from "@/lib/sourcing/search/providers/types";
import type { SearchProviderId } from "@/lib/sourcing/search/types";

export function resolveSearchProviderId(
  options?: SearchProviderOptions
): SearchProviderId {
  if (options?.forceMock) return "mock";

  const prefer =
    options?.prefer ||
    (process.env.SOURCING_SEARCH_PROVIDER?.trim().toLowerCase() as SearchProviderId | undefined);

  if (prefer === "mock") return "mock";
  if (prefer === "tavily" && isTavilyConfigured()) return "tavily";
  if (prefer === "openai" && isOpenAiSearchConfigured()) return "openai";

  // Default live preference: Tavily first, OpenAI optional later.
  if (isTavilyConfigured()) return "tavily";
  if (isOpenAiSearchConfigured()) return "openai";
  return "mock";
}

export function isLiveSearchConfigured(): boolean {
  return isTavilyConfigured() || isOpenAiSearchConfigured();
}

export function getConfiguredSearchProviderLabel(): string {
  if (isTavilyConfigured()) return "Tavily";
  if (isOpenAiSearchConfigured()) return "OpenAI";
  return "Mock only (no live key)";
}

/**
 * Run the active internet-search provider. Workflow (persist/classify/dedupe)
 * stays in run.ts and does not care which provider produced the payload.
 */
export async function runInternetSearch(
  profile: BuyingProfile,
  options?: SearchProviderOptions
): Promise<SearchProviderResult> {
  const id = resolveSearchProviderId(options);
  if (id === "tavily") return runTavilyProvider(profile, options);
  if (id === "openai") return runOpenAiProvider(profile, options);
  return runMockSearch(profile, options);
}
