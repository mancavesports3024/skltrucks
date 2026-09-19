import type { BuyingProfile, ListedWeightTerm, SpecEvidence } from "@/types/sourcing";

export type SearchProviderId = "mock" | "tavily" | "openai";

export interface SearchApiUsage {
  provider: SearchProviderId;
  model: string;
  webSearchCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  live: boolean;
  /** Tavily API credits consumed this run (0 for mock / OpenAI). */
  creditsConsumed: number;
  searchesRun?: number;
  extractsRun?: number;
}

export interface ExtractedTruckCandidate {
  listingUrl: string;
  sourceName: string;
  seller: string;
  stockNumber: string;
  vin: string;
  year: number | null;
  makeModel: string;
  engine: string;
  engineIsCummins: boolean | null;
  engineEvidence: string;
  transmission: string;
  transmissionIsAutomatic: boolean | null;
  transmissionEvidence: string;
  boxLengthFt: number | null;
  boxLengthEvidence: string;
  manufacturerGvwrLbs: number | null;
  listedWeightLbs: number | null;
  listedWeightTerm: ListedWeightTerm;
  gvwrEvidence: string;
  mileage: number | null;
  hasLiftgate: boolean | null;
  askingPrice: number | null;
  auctionCurrentBid: number | null;
  location: string;
  drivingDistanceMiles: number | null;
  distanceIsEstimate: boolean;
  phone: string;
  contactName: string;
  contactRole: string;
  evidenceUrl: string;
  notes: string;
}

export interface ExtractedContactCandidate {
  company: string;
  contactName: string;
  role: string;
  phone: string;
  email: string;
  sourceUrl: string;
  supplierType: string;
  evidenceQuote: string;
  notes: string;
}

export interface SearchModelPayload {
  trucks: ExtractedTruckCandidate[];
  contacts: ExtractedContactCandidate[];
  sourcesConsulted: string[];
  queriesUsed: string[];
  notes: string;
}

export interface SearchRunReport {
  id?: string;
  status: "completed" | "partial" | "failed";
  generatedAt: string;
  buyingProfile: BuyingProfile;
  queriesExecuted: string[];
  sourcesSearched: string[];
  resultsExamined: number;
  newLeadsSaved: number;
  confirmedMatches: number;
  needsVerification: number;
  duplicatesOrRejected: number;
  contactsSaved: number;
  apiUsage: SearchApiUsage;
  errors: string[];
  trucksSaved: Array<{
    id?: string;
    seller: string;
    stockNumber: string;
    listingUrl: string;
    matchStatus: string;
    outcome: "inserted" | "listing_change" | "seen_again" | "rejected";
    reason?: string;
  }>;
  contactsFound: Array<{
    company: string;
    phone: string;
    contactName: string;
    sourceUrl: string;
    outcome: "inserted" | "skipped" | "rejected";
    reason?: string;
  }>;
}

/** Rough cost model for gpt-4o-mini + web_search (OpenAI published rates). */
export function estimateOpenAiSearchCostUsd(usage: {
  webSearchCalls: number;
  inputTokens: number;
  outputTokens: number;
}): number {
  const search = usage.webSearchCalls * 0.01; // $10 / 1k
  const input = (usage.inputTokens / 1_000_000) * 0.15;
  const output = (usage.outputTokens / 1_000_000) * 0.6;
  return Math.round((search + input + output) * 10000) / 10000;
}

/** @deprecated Prefer estimateOpenAiSearchCostUsd — kept for older imports. */
export const estimateSearchCostUsd = estimateOpenAiSearchCostUsd;

/** Tavily credit estimate: ~$0.008/credit on pay-as-you-go. */
export function estimateTavilyCostUsd(credits: number): number {
  return Math.round(credits * 0.008 * 10000) / 10000;
}

export function emptySpecEvidenceFromCandidate(t: ExtractedTruckCandidate): SpecEvidence {
  return {
    engine: (t.engineEvidence || "").trim(),
    transmission: (t.transmissionEvidence || "").trim(),
    boxLength: (t.boxLengthEvidence || "").trim(),
    gvwr: (t.gvwrEvidence || "").trim(),
  };
}

/** Strip secrets from provider errors before UI / DB / logs. */
export function sanitizeProviderError(err: unknown): string {
  let msg = err instanceof Error ? err.message : "Search provider failed";
  msg = msg.replace(/tvly-[A-Za-z0-9_-]+/gi, "[redacted]");
  msg = msg.replace(/sk-[A-Za-z0-9._-]+/gi, "[redacted]");
  msg = msg.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  msg = msg.replace(/api[_-]?key[=:"'\s]+\S+/gi, "api_key=[redacted]");
  return msg;
}
