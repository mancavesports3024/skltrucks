import "server-only";

import { tavily } from "@tavily/core";
import { isIndividualListingUrl } from "@/lib/sourcing/search/map-candidates";
import {
  extractContactFromPageText,
  extractTruckFromPageText,
} from "@/lib/sourcing/search/extract-from-text";
import { buildSearchQueryPlans } from "@/lib/sourcing/search/queries";
import type { SearchProviderFn, SearchProviderResult } from "@/lib/sourcing/search/providers/types";
import type {
  ExtractedContactCandidate,
  ExtractedTruckCandidate,
} from "@/lib/sourcing/search/types";
import {
  estimateTavilyCostUsd,
  sanitizeProviderError,
} from "@/lib/sourcing/search/types";
import type { BuyingProfile } from "@/types/sourcing";

/** Hard cap for one staff pilot run — never exceed. */
export const MAX_TAVILY_CREDITS_PER_RUN = 20;
/** Basic search = 1 credit each. */
export const MAX_TAVILY_SEARCHES_PER_RUN = 10;
/**
 * Basic extract = 1 credit per 5 successful URLs.
 * Cap successful extracts so search+extract stay ≤ 20 credits
 * (10 searches + ceil(25/5)=5 extract credits = 15).
 */
export const MAX_TAVILY_EXTRACT_URLS_PER_RUN = 25;

export function getTavilyApiKey(): string | undefined {
  const key = process.env.TAVILY_API_KEY?.trim();
  return key || undefined;
}

export function isTavilyConfigured(): boolean {
  return Boolean(getTavilyApiKey());
}

export interface TavilySearchHit {
  url: string;
  title?: string;
  content?: string;
  rawContent?: string | null;
}

export interface TavilySearchResponse {
  results?: TavilySearchHit[];
  usage?: { credits?: number };
}

export interface TavilyExtractResult {
  url: string;
  rawContent?: string | null;
}

export interface TavilyExtractResponse {
  results?: TavilyExtractResult[];
  failedResults?: unknown[];
  usage?: { credits?: number };
}

/** Minimal client surface for production SDK + unit-test mocks. */
export interface TavilyClientLike {
  search: (
    query: string,
    options?: Record<string, unknown>
  ) => Promise<TavilySearchResponse>;
  extract: (
    urls: string[] | string,
    options?: Record<string, unknown>
  ) => Promise<TavilyExtractResponse>;
}

export interface TavilyRunOptions {
  client?: TavilyClientLike;
  maxCredits?: number;
  maxSearches?: number;
  maxExtractUrls?: number;
}

class CreditBudget {
  used = 0;
  searches = 0;
  extracts = 0;
  constructor(readonly max: number) {}

  canAfford(n: number): boolean {
    return this.used + n <= this.max;
  }

  charge(n: number): boolean {
    if (!this.canAfford(n)) return false;
    this.used += n;
    return true;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function needsExtract(truck: ExtractedTruckCandidate): boolean {
  // Extract only when discovery snippet lacks phone or any required evidence.
  if (!truck.phone) return true;
  if (!truck.engineEvidence) return true;
  if (!truck.transmissionEvidence) return true;
  if (!truck.boxLengthEvidence) return true;
  if (!truck.gvwrEvidence && truck.listedWeightTerm !== "gvw") return true;
  return false;
}

function mergeTruck(
  base: ExtractedTruckCandidate,
  richer: ExtractedTruckCandidate
): ExtractedTruckCandidate {
  return {
    ...base,
    stockNumber: richer.stockNumber || base.stockNumber,
    vin: richer.vin || base.vin,
    year: richer.year ?? base.year,
    makeModel: richer.makeModel || base.makeModel,
    engine: richer.engine || base.engine,
    engineIsCummins: richer.engineIsCummins ?? base.engineIsCummins,
    engineEvidence: richer.engineEvidence || base.engineEvidence,
    transmission: richer.transmission || base.transmission,
    transmissionIsAutomatic:
      richer.transmissionIsAutomatic ?? base.transmissionIsAutomatic,
    transmissionEvidence: richer.transmissionEvidence || base.transmissionEvidence,
    boxLengthFt: richer.boxLengthFt ?? base.boxLengthFt,
    boxLengthEvidence: richer.boxLengthEvidence || base.boxLengthEvidence,
    manufacturerGvwrLbs: richer.manufacturerGvwrLbs ?? base.manufacturerGvwrLbs,
    listedWeightLbs: richer.listedWeightLbs ?? base.listedWeightLbs,
    listedWeightTerm:
      richer.listedWeightTerm !== "unknown" ? richer.listedWeightTerm : base.listedWeightTerm,
    gvwrEvidence: richer.gvwrEvidence || base.gvwrEvidence,
    mileage: richer.mileage ?? base.mileage,
    hasLiftgate: richer.hasLiftgate ?? base.hasLiftgate,
    askingPrice: richer.askingPrice ?? base.askingPrice,
    auctionCurrentBid: richer.auctionCurrentBid ?? base.auctionCurrentBid,
    location: richer.location || base.location,
    phone: richer.phone || base.phone,
    contactName: richer.contactName || base.contactName,
    contactRole: richer.contactRole || base.contactRole,
    notes: [base.notes, richer.notes].filter(Boolean).join(" "),
  };
}

export function createTavilyClient(apiKey: string): TavilyClientLike {
  return tavily({ apiKey }) as unknown as TavilyClientLike;
}

/**
 * Tavily basic search (+ selective basic extract) pilot.
 * Credits are tracked locally and capped; API key is never returned or logged.
 */
export async function runTavilySearch(
  profile: BuyingProfile,
  options?: TavilyRunOptions
): Promise<SearchProviderResult> {
  const apiKey = getTavilyApiKey();
  if (!apiKey && !options?.client) {
    throw new Error("Tavily is not configured.");
  }

  const client = options?.client ?? createTavilyClient(apiKey!);
  const maxCredits = options?.maxCredits ?? MAX_TAVILY_CREDITS_PER_RUN;
  const maxSearches = options?.maxSearches ?? MAX_TAVILY_SEARCHES_PER_RUN;
  const maxExtractUrls = options?.maxExtractUrls ?? MAX_TAVILY_EXTRACT_URLS_PER_RUN;
  const budget = new CreditBudget(maxCredits);

  const plans = buildSearchQueryPlans(profile).slice(0, maxSearches);
  const queriesUsed: string[] = [];
  const sources = new Set<string>();
  const errors: string[] = [];
  const byUrl = new Map<string, ExtractedTruckCandidate>();
  const contactsByKey = new Map<string, ExtractedContactCandidate>();
  const candidateExtractUrls: string[] = [];

  for (const plan of plans) {
    if (!budget.canAfford(1)) break;
    if (budget.searches >= maxSearches) break;

    try {
      const response = await client.search(plan.query, {
        searchDepth: "basic",
        maxResults: 5,
        includeAnswer: false,
        includeRawContent: false,
        includeImages: false,
        includeUsage: true,
        excludeDomains: [
          "youtube.com",
          "youtu.be",
          "reddit.com",
          "facebook.com",
          "instagram.com",
          "tiktok.com",
          "twitter.com",
          "x.com",
          "c-span.org",
          "wikipedia.org",
        ],
        ...(plan.includeDomains?.length ? { includeDomains: plan.includeDomains } : {}),
      });

      const reported = Number(response.usage?.credits);
      const charged = Number.isFinite(reported) && reported > 0 ? reported : 1;
      if (!budget.charge(charged)) {
        errors.push("Stopped: Tavily credit budget would be exceeded.");
        break;
      }
      budget.searches += 1;
      queriesUsed.push(
        plan.includeDomains?.length
          ? `${plan.query} [domains: ${plan.includeDomains.join(", ")}]`
          : plan.query
      );

      for (const hit of response.results ?? []) {
        const url = (hit.url || "").trim();
        if (!url) continue;
        const host = hostOf(url);
        if (host) sources.add(host);

        const page = {
          url,
          title: hit.title || "",
          content: hit.content || hit.rawContent || "",
          sourceName: host,
        };

        if (plan.purpose === "contact_discovery" || /contact/i.test(url)) {
          const contact = extractContactFromPageText(page);
          if (contact) {
            contactsByKey.set(`${contact.company}|${contact.phone}`, contact);
          }
        }

        if (!isIndividualListingUrl(url)) continue;

        const truck = extractTruckFromPageText(page);
        const existing = byUrl.get(url);
        byUrl.set(url, existing ? mergeTruck(existing, truck) : truck);
        if (needsExtract(truck) && !candidateExtractUrls.includes(url)) {
          candidateExtractUrls.push(url);
        }

        if (truck.phone) {
          const contact = extractContactFromPageText(page);
          if (contact) {
            contactsByKey.set(`${contact.company}|${contact.phone}`, contact);
          }
        }
      }
    } catch (e) {
      errors.push(sanitizeProviderError(e));
    }
  }

  // Selective extract — only when snippets were insufficient and budget remains.
  // Basic extract: 1 credit per 5 successful URLs.
  const toExtract = candidateExtractUrls.slice(0, maxExtractUrls);
  for (let i = 0; i < toExtract.length; ) {
    const remainingCredits = budget.max - budget.used;
    if (remainingCredits < 1) break;
    // Max URLs we can still afford at basic rate (ceil(n/5) credits)
    const maxAffordableUrls = Math.min(5 * remainingCredits, toExtract.length - i, 5);
    if (maxAffordableUrls < 1) break;
    const batch = toExtract.slice(i, i + maxAffordableUrls);
    i += batch.length;

    try {
      const response = await client.extract(batch, {
        extractDepth: "basic",
        includeImages: false,
        includeUsage: true,
      });
      const successCount = (response.results ?? []).length;
      const reported = Number(response.usage?.credits);
      const charged =
        Number.isFinite(reported) && reported >= 0
          ? reported
          : successCount > 0
            ? Math.ceil(successCount / 5)
            : 0;
      if (charged > 0 && !budget.charge(charged)) {
        errors.push("Stopped extract: Tavily credit budget would be exceeded.");
        break;
      }
      budget.extracts += successCount;

      for (const item of response.results ?? []) {
        const url = (item.url || "").trim();
        if (!url || !item.rawContent) continue;
        const richer = extractTruckFromPageText({
          url,
          title: byUrl.get(url)?.makeModel || "",
          content: item.rawContent,
          sourceName: byUrl.get(url)?.seller || hostOf(url),
        });
        const existing = byUrl.get(url);
        byUrl.set(url, existing ? mergeTruck(existing, richer) : richer);
        if (richer.phone) {
          const contact = extractContactFromPageText({
            url,
            content: item.rawContent,
            sourceName: richer.seller,
          });
          if (contact) contactsByKey.set(`${contact.company}|${contact.phone}`, contact);
        }
      }
    } catch (e) {
      errors.push(sanitizeProviderError(e));
    }
  }

  const trucks = [...byUrl.values()];
  const contacts = [...contactsByKey.values()];
  const notes = [
    `Tavily basic search pilot. Credits used: ${budget.used}/${maxCredits}.`,
    `Searches: ${budget.searches}. Extracts: ${budget.extracts}.`,
    errors.length ? `Errors: ${errors.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    provider: "tavily",
    payload: {
      trucks,
      contacts,
      sourcesConsulted: [...sources],
      queriesUsed,
      notes,
    },
    usage: {
      provider: "tavily",
      model: "tavily-basic",
      webSearchCalls: budget.searches,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: estimateTavilyCostUsd(budget.used),
      live: true,
      creditsConsumed: budget.used,
      searchesRun: budget.searches,
      extractsRun: budget.extracts,
    },
    rawText: notes,
    queriesPlanned: plans.map((p) => p.query),
  };
}

export const runTavilyProvider: SearchProviderFn = async (profile) =>
  runTavilySearch(profile);
