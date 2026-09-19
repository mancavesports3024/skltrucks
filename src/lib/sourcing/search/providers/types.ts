import type { BuyingProfile } from "@/types/sourcing";
import type { SearchApiUsage, SearchModelPayload, SearchProviderId } from "@/lib/sourcing/search/types";

export interface SearchProviderResult {
  provider: SearchProviderId;
  payload: SearchModelPayload;
  usage: SearchApiUsage;
  rawText: string;
  queriesPlanned: string[];
}

export interface SearchProviderOptions {
  forceMock?: boolean;
  /** Prefer a specific provider when configured. */
  prefer?: SearchProviderId;
}

export type SearchProviderFn = (
  profile: BuyingProfile,
  options?: SearchProviderOptions
) => Promise<SearchProviderResult>;
