import type { BuyingProfile } from "@/types/sourcing";
import type {
  SearchApiUsage,
  SearchProviderId,
  SearchRunReport,
} from "@/lib/sourcing/search/types";
import { sanitizeProviderError } from "@/lib/sourcing/search/types";

export type SearchFailedStage = "discovery" | "inspection" | "provider" | "unknown";

/**
 * Typed provider failure so the run catch path can report accurate provider/usage.
 * Never put API keys or full raw model responses on this object.
 */
export class ProviderSearchError extends Error {
  readonly provider: SearchProviderId;
  readonly live: boolean;
  readonly stage: SearchFailedStage;
  readonly listingUrl?: string;
  readonly usage: SearchApiUsage;
  readonly queriesExecuted: string[];
  readonly sourcesSearched: string[];
  readonly staffMessage: string;
  readonly formatRetries: number;

  constructor(opts: {
    provider: SearchProviderId;
    live: boolean;
    stage: SearchFailedStage;
    staffMessage: string;
    usage: SearchApiUsage;
    queriesExecuted?: string[];
    sourcesSearched?: string[];
    listingUrl?: string;
    formatRetries?: number;
    cause?: unknown;
  }) {
    super(opts.staffMessage);
    this.name = "ProviderSearchError";
    this.provider = opts.provider;
    this.live = opts.live;
    this.stage = opts.stage;
    this.listingUrl = opts.listingUrl;
    this.usage = opts.usage;
    this.queriesExecuted = opts.queriesExecuted ?? [];
    this.sourcesSearched = opts.sourcesSearched ?? [];
    this.staffMessage = opts.staffMessage;
    this.formatRetries = opts.formatRetries ?? 0;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

export function isProviderSearchError(err: unknown): err is ProviderSearchError {
  return err instanceof ProviderSearchError;
}

export function staffMessageForStage(
  stage: SearchFailedStage,
  listingUrl?: string
): string {
  if (stage === "discovery") {
    return "OpenAI returned invalid structured data during discovery.";
  }
  if (stage === "inspection") {
    const url = listingUrl ? ` (${listingUrl})` : "";
    return `OpenAI returned invalid structured data during inspection${url}.`;
  }
  return sanitizeProviderError(new Error("Search provider failed"));
}

export function defaultUsageForProvider(
  provider: SearchProviderId,
  model = "none"
): SearchApiUsage {
  return {
    provider,
    model,
    webSearchCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    live: provider !== "mock",
    creditsConsumed: 0,
    searchesRun: 0,
    extractsRun: 0,
  };
}

/** Pure failure-report builder — never hardcodes provider=mock. */
export function buildFailedSearchReport(opts: {
  profile: BuyingProfile;
  error: unknown;
  resolvedProviderId: SearchProviderId;
  resolvedModel: string;
}): SearchRunReport {
  const { profile, error, resolvedProviderId, resolvedModel } = opts;
  const message = isProviderSearchError(error)
    ? error.staffMessage
    : sanitizeProviderError(error);

  const apiUsage = isProviderSearchError(error)
    ? error.usage
    : {
        ...defaultUsageForProvider(resolvedProviderId, resolvedModel),
        live: resolvedProviderId !== "mock",
        provider: resolvedProviderId,
        model: resolvedModel,
      };

  return {
    status: "failed",
    generatedAt: new Date().toISOString(),
    buyingProfile: profile,
    queriesExecuted: isProviderSearchError(error) ? error.queriesExecuted : [],
    sourcesSearched: isProviderSearchError(error) ? error.sourcesSearched : [],
    resultsExamined: 0,
    newLeadsSaved: 0,
    confirmedMatches: 0,
    needsVerification: 0,
    duplicatesOrRejected: 0,
    contactsSaved: 0,
    apiUsage,
    errors: [message],
    trucksSaved: [],
    contactsFound: [],
  };
}
