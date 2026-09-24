/**
 * Tavily Discovery → Validation → Inspection Preview (read-only).
 * Never writes leads/contacts. Import is a separate explicit action.
 */
import { createHash, randomUUID } from "node:crypto";
import { canonicalizeListingUrl } from "@/lib/sourcing/duplicates";
import { findExistingLead } from "@/lib/sourcing/intake/import";
import { classifyLead } from "@/lib/sourcing/match";
import {
  clampDiscoveryInspectCeilings,
  DEFAULT_DISCOVERY_INSPECT_CEILINGS,
  estimateDiscoveryInspectCombinedMaxCostUsd,
  type DiscoveryInspectCeilings,
} from "@/lib/sourcing/search/discovery/ceilings";
import { buildDiscoveryQueryMatrix } from "@/lib/sourcing/search/discovery/query-matrix";
import type {
  DiscoverySearchClient,
  DiscoveryUrlMetrics,
  RetainedDiscoveryUrl,
} from "@/lib/sourcing/search/discovery/types";
import { DEFAULT_DISCOVERY_BENCHMARK_CEILINGS } from "@/lib/sourcing/search/discovery/types";
import { classifyDiscoveryUrl } from "@/lib/sourcing/search/discovery/url-classify";
import { inspectListingHtmlDeterministic } from "@/lib/sourcing/search/discovery-inspect/deterministic-inspect";
import type {
  DiscoveryInspectPreviewReport,
  DiscoveryInspectPreviewRow,
} from "@/lib/sourcing/search/discovery-inspect/types";
import { validateDiscoveryCandidate } from "@/lib/sourcing/search/discovery-inspect/validate-url";
import { emptySpecEvidenceFromCandidate } from "@/lib/sourcing/search/types";
import {
  candidateToTruckLeadInput,
} from "@/lib/sourcing/search/map-candidates";
import {
  estimateOpenAiSearchCostUsd,
  estimateTavilyCostUsd,
  type ExtractedTruckCandidate,
  type SearchApiUsage,
} from "@/lib/sourcing/search/types";
import type { BuyingProfile, TruckLead } from "@/types/sourcing";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

const EMPTY_METRICS = (): DiscoveryUrlMetrics => ({
  rawResultUrls: 0,
  uniqueCanonicalUrlsAllBuckets: 0,
  uniqueIndividualUrls: 0,
  uniqueLikelyUrls: 0,
  uniqueHubUrls: 0,
  uniqueUnsafeUrls: 0,
  retainedUrls: 0,
  duplicateRawHits: 0,
  retentionCapDrops: 0,
});

/** Noise hosts excluded at Tavily search time (final benchmark lessons). */
const DISCOVERY_EXCLUDE_DOMAINS = [
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
  "ebay.com",
  "soarr.com",
  "cummins.com",
  "justanswer.com",
  "cumminsforum.com",
  "dieseltruckresource.com",
  "expeditionportal.com",
  "autohelperbot.com",
  "epicvin.com",
  "truckradar.ai",
] as const;

export function createTavilyDiscoveryOnlyClient(args: {
  search: (
    query: string,
    options?: Record<string, unknown>
  ) => Promise<{
    results?: Array<{ url?: string; title?: string; content?: string }>;
    usage?: { credits?: number };
  }>;
}): DiscoverySearchClient {
  return {
    async search(query, options) {
      const response = await args.search(query, {
        searchDepth: "basic",
        maxResults: options?.maxResults ?? 10,
        includeAnswer: false,
        includeRawContent: false,
        includeImages: false,
        includeUsage: true,
        excludeDomains: [...DISCOVERY_EXCLUDE_DOMAINS],
        ...(options?.includeDomains?.length
          ? { includeDomains: options.includeDomains }
          : {}),
      });
      const reported = Number(response.usage?.credits);
      const creditsCharged =
        Number.isFinite(reported) && reported > 0 ? reported : 1;
      const results = (response.results ?? [])
        .map((r) => ({
          url: String(r.url ?? "").trim(),
          title: r.title ? String(r.title) : undefined,
          content: r.content ? String(r.content) : undefined,
        }))
        .filter((r) => r.url);
      return { results, creditsCharged };
    },
  };
}

async function runDiscoveryRetain(args: {
  client: DiscoverySearchClient;
  profile: BuyingProfile;
  ceilings: DiscoveryInspectCeilings;
}): Promise<{
  plans: ReturnType<typeof buildDiscoveryQueryMatrix>;
  retained: RetainedDiscoveryUrl[];
  metrics: DiscoveryUrlMetrics;
  credits: number;
}> {
  const plans = buildDiscoveryQueryMatrix(args.profile, {
    maxQueries: args.ceilings.maxQueries,
    includeDomainTargeted: true,
  });
  const byCanonical = new Map<string, RetainedDiscoveryUrl>();
  const uniqueByBucket = {
    individual_listing: new Set<string>(),
    likely_listing_needs_inspection: new Set<string>(),
    hub_or_category: new Set<string>(),
    unsupported_or_unsafe: new Set<string>(),
  };
  let rawResultUrls = 0;
  let duplicateRawHits = 0;
  let retentionCapDrops = 0;
  let credits = 0;
  let queriesRun = 0;

  for (const plan of plans) {
    if (credits >= args.ceilings.maxTavilyCredits) break;
    if (queriesRun >= args.ceilings.maxQueries) break;
    const res = await args.client.search(plan.query, {
      maxResults: args.ceilings.maxResultsPerQuery,
      includeDomains: plan.includeDomains,
      searchDepth: "basic",
    });
    const charged = res.creditsCharged || 1;
    if (credits + charged > args.ceilings.maxTavilyCredits) break;
    credits += charged;
    queriesRun += 1;

    for (const hit of res.results) {
      rawResultUrls += 1;
      const classified = classifyDiscoveryUrl(hit.url);
      const uniqueKey =
        classified.canonicalUrl ||
        (classified.bucket === "unsupported_or_unsafe"
          ? `unsafe:${classified.hostname}:${classified.reason}`
          : "");
      if (uniqueKey) uniqueByBucket[classified.bucket].add(uniqueKey);

      if (
        classified.bucket !== "individual_listing" &&
        classified.bucket !== "likely_listing_needs_inspection"
      ) {
        continue;
      }
      if (!classified.canonicalUrl) continue;

      const existing = byCanonical.get(classified.canonicalUrl);
      if (existing) {
        duplicateRawHits += 1;
        existing.provenance.push({
          queryId: plan.id,
          query: plan.query,
          rawUrl: hit.url,
          title: hit.title,
        });
        continue;
      }
      if (byCanonical.size >= args.ceilings.maxRetainedListingUrls) {
        retentionCapDrops += 1;
        continue;
      }
      byCanonical.set(classified.canonicalUrl, {
        ...classified,
        title: hit.title,
        provenance: [
          {
            queryId: plan.id,
            query: plan.query,
            rawUrl: hit.url,
            title: hit.title,
          },
        ],
      });
    }
  }

  const retained = [...byCanonical.values()];
  const all = new Set<string>();
  for (const set of Object.values(uniqueByBucket)) {
    for (const u of set) if (u) all.add(u);
  }
  return {
    plans,
    retained,
    credits,
    metrics: {
      rawResultUrls,
      uniqueCanonicalUrlsAllBuckets: all.size,
      uniqueIndividualUrls: uniqueByBucket.individual_listing.size,
      uniqueLikelyUrls: uniqueByBucket.likely_listing_needs_inspection.size,
      uniqueHubUrls: uniqueByBucket.hub_or_category.size,
      uniqueUnsafeUrls: uniqueByBucket.unsupported_or_unsafe.size,
      retainedUrls: retained.length,
      duplicateRawHits,
      retentionCapDrops,
    },
  };
}

function rowId(canonicalUrl: string): string {
  return createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 16);
}

function missingRequiredEvidence(truck: ExtractedTruckCandidate): boolean {
  return (
    !truck.engineEvidence ||
    !truck.transmissionEvidence ||
    !truck.boxLengthEvidence ||
    (!truck.gvwrEvidence &&
      truck.listedWeightTerm !== "gvw" &&
      truck.manufacturerGvwrLbs == null)
  );
}

export type RunDiscoveryInspectPreviewInput = {
  profile?: BuyingProfile;
  existingLeads?: TruckLead[];
  mode: "mock" | "live";
  confirmPaidProviders: boolean;
  ceilings?: Partial<DiscoveryInspectCeilings>;
  tavilyClient?: DiscoverySearchClient;
  /** Optional OpenAI exact-URL inspect (injected; never discovery). */
  openAiInspectUrl?: (
    url: string
  ) => Promise<{ truck: ExtractedTruckCandidate | null; rejectReason?: string }>;
  validateFetchImpl?: typeof fetch;
  allowLiveNetwork?: boolean;
};

/**
 * Run discovery + validate + inspect Preview. Zero DB writes.
 */
export async function runDiscoveryInspectPreview(
  input: RunDiscoveryInspectPreviewInput
): Promise<DiscoveryInspectPreviewReport> {
  const profile = input.profile ?? DEFAULT_BUYING_PROFILE;
  const ceilings = clampDiscoveryInspectCeilings(input.ceilings);
  const costCeiling = estimateDiscoveryInspectCombinedMaxCostUsd(ceilings);
  const errors: string[] = [];
  const notes = [
    "Preview only — no leads or contacts are saved until Import selected leads.",
    "Confirmed requires individual-page evidence bound to the final URL.",
    "Tavily extract is disabled. OpenAI is inspect-only for missing evidence.",
  ];

  if (input.mode === "live" && !input.confirmPaidProviders) {
    throw new Error("REFUSE: paid-provider confirmation required for live Preview.");
  }
  if (input.mode === "live" && !input.allowLiveNetwork && !input.tavilyClient) {
    throw new Error("REFUSE: live Preview requires allowLiveNetwork or injected client.");
  }

  const client = input.tavilyClient;
  if (!client) {
    throw new Error("REFUSE: discovery client required (mock or Tavily).");
  }

  const discovery = await runDiscoveryRetain({ client, profile, ceilings });

  const rejectedBeforeInspect: DiscoveryInspectPreviewReport["rejectedBeforeInspect"] = [];
  const validated = [];
  for (const r of discovery.retained) {
    const v = await validateDiscoveryCandidate(r.canonicalUrl || r.rawUrl, {
      fetchImpl: input.validateFetchImpl,
    });
    if (v.outcome !== "validated") {
      rejectedBeforeInspect.push({
        url: r.canonicalUrl || r.rawUrl,
        reason: v.reason,
        outcome: v.outcome,
      });
      continue;
    }
    validated.push(v);
  }

  const toInspect = validated.slice(0, ceilings.maxInspectCandidates);
  const existingLeads = input.existingLeads ?? [];
  const rows: DiscoveryInspectPreviewRow[] = [];

  // Pre-inspect rejects as rows (not import-eligible)
  for (const r of discovery.retained) {
    const rejected = rejectedBeforeInspect.find(
      (x) => x.url === (r.canonicalUrl || r.rawUrl)
    );
    if (!rejected) continue;
    rows.push({
      id: rowId(r.canonicalUrl || r.rawUrl),
      discoveryUrl: r.rawUrl,
      finalUrl: r.canonicalUrl || r.rawUrl,
      canonicalUrl: r.canonicalUrl || "",
      bucket: r.bucket,
      title: r.title || "",
      validationOutcome: rejected.outcome,
      validationReason: rejected.reason,
      matchStatus: rejected.outcome === "unverified" ? "unverified" : "not_inspected",
      previewOutcome:
        rejected.outcome === "unverified" ? "unverified" : "rejected_pre_inspect",
      reasons: [rejected.reason],
      truck: null,
      contact: null,
      evidence: {},
      alreadyInSkl: false,
      importEligible: false,
      provenance: r.provenance,
    });
  }

  let openAiInspectCalls = 0;
  let openAiCost = 0;

  for (const v of toInspect) {
    const provenance =
      discovery.retained.find((r) => r.canonicalUrl === v.canonicalUrl)?.provenance ??
      [];
    let truck: ExtractedTruckCandidate | null = null;
    let contact = null;
    let inspectFailed = false;

    try {
      const det = inspectListingHtmlDeterministic({
        finalUrl: v.finalUrl,
        html: v.html || "",
        title: v.title,
      });
      truck = det.truck;
      contact = det.contact;

      if (
        det.requiredEvidenceMissing &&
        input.openAiInspectUrl &&
        openAiInspectCalls < ceilings.maxOpenAiInspectCalls
      ) {
        openAiInspectCalls += 1;
        openAiCost += estimateOpenAiSearchCostUsd({
          webSearchCalls: 1,
          inputTokens: 4_000,
          outputTokens: 1_500,
        });
        const oa = await input.openAiInspectUrl(v.finalUrl);
        if (oa.truck) {
          // Bind URL — never allow OpenAI to substitute.
          if (canonicalizeListingUrl(oa.truck.listingUrl) !== canonicalizeListingUrl(v.finalUrl)) {
            oa.truck.listingUrl = v.finalUrl;
            oa.truck.evidenceUrl = v.finalUrl;
          }
          truck = { ...det.truck, ...oa.truck, listingUrl: v.finalUrl, evidenceUrl: v.finalUrl };
        } else if (oa.rejectReason) {
          errors.push(`inspect:${v.finalUrl}: ${oa.rejectReason}`);
        }
      }
    } catch (e) {
      inspectFailed = true;
      errors.push(
        `inspect:${v.finalUrl}: ${e instanceof Error ? e.message : "inspect failed"}`
      );
    }

    if (inspectFailed || !truck) {
      rows.push({
        id: rowId(v.canonicalUrl),
        discoveryUrl: v.discoveryUrl,
        finalUrl: v.finalUrl,
        canonicalUrl: v.canonicalUrl,
        bucket: "individual_listing",
        title: v.title,
        validationOutcome: v.outcome,
        validationReason: v.reason,
        matchStatus: "inspect_failed",
        previewOutcome: "inspect_failed",
        reasons: ["Inspection failed or produced no truck"],
        truck: null,
        contact: null,
        evidence: {},
        alreadyInSkl: false,
        importEligible: false,
        provenance,
      });
      continue;
    }

    const mapped = candidateToTruckLeadInput(truck);
    if (mapped.rejectReason) {
      rows.push({
        id: rowId(v.canonicalUrl),
        discoveryUrl: v.discoveryUrl,
        finalUrl: v.finalUrl,
        canonicalUrl: v.canonicalUrl,
        bucket: "individual_listing",
        title: v.title,
        validationOutcome: v.outcome,
        validationReason: v.reason,
        matchStatus: "does_not_match",
        previewOutcome: "does_not_match",
        reasons: [mapped.rejectReason],
        truck,
        contact,
        evidence: emptySpecEvidenceFromCandidate(truck),
        alreadyInSkl: false,
        importEligible: false,
        provenance,
      });
      continue;
    }

    const existing = findExistingLead(existingLeads, mapped.input);
    if (existing) {
      rows.push({
        id: rowId(v.canonicalUrl),
        discoveryUrl: v.discoveryUrl,
        finalUrl: v.finalUrl,
        canonicalUrl: v.canonicalUrl,
        bucket: "individual_listing",
        title: v.title,
        validationOutcome: v.outcome,
        validationReason: v.reason,
        matchStatus: "duplicate",
        previewOutcome: "duplicate",
        reasons: ["Already in SKL (VIN / listing id / canonical URL)"],
        truck,
        contact,
        evidence: emptySpecEvidenceFromCandidate(truck),
        alreadyInSkl: true,
        importEligible: false,
        provenance,
      });
      continue;
    }

    const match = classifyLead(mapped.input, profile);
    const evidence = emptySpecEvidenceFromCandidate(truck);
    let previewOutcome: DiscoveryInspectPreviewRow["previewOutcome"] =
      match.status === "confirmed_match"
        ? "confirmed_match"
        : match.status === "needs_verification" || match.status === "out_of_range_opportunity"
          ? "needs_verification"
          : "does_not_match";

    if (missingRequiredEvidence(truck) && previewOutcome === "confirmed_match") {
      previewOutcome = "needs_verification";
    }

    const importEligible =
      previewOutcome === "confirmed_match" || previewOutcome === "needs_verification";

    rows.push({
      id: rowId(v.canonicalUrl),
      discoveryUrl: v.discoveryUrl,
      finalUrl: v.finalUrl,
      canonicalUrl: v.canonicalUrl,
      bucket: "individual_listing",
      title: v.title,
      validationOutcome: v.outcome,
      validationReason: v.reason,
      matchStatus: match.status,
      previewOutcome,
      reasons: match.reasons.map((r) => r.label),
      truck,
      contact,
      evidence,
      alreadyInSkl: false,
      importEligible,
      provenance,
    });
  }

  const tavilyEstimatedCostUsd = estimateTavilyCostUsd(discovery.credits);
  const usage: SearchApiUsage = {
    provider: input.mode === "mock" ? "mock" : "tavily",
    model: input.mode === "mock" ? "mock-discovery-inspect" : "tavily-basic+openai-inspect",
    webSearchCalls: openAiInspectCalls,
    inputTokens: openAiInspectCalls * 4_000,
    outputTokens: openAiInspectCalls * 1_500,
    estimatedCostUsd:
      Math.round((tavilyEstimatedCostUsd + openAiCost) * 10000) / 10000,
    live: input.mode === "live",
    creditsConsumed: discovery.credits,
    searchesRun: discovery.plans.length,
    extractsRun: 0,
  };

  return {
    mode: input.mode,
    generatedAt: new Date().toISOString(),
    dbWrites: false,
    previewOnly: true,
    tavilyExtractCalled: false,
    openaiDiscoveryCalled: false,
    buyingProfile: profile,
    ceilings,
    queryPlans: discovery.plans,
    discoveryMetrics: discovery.metrics,
    tavilyCredits: discovery.credits,
    tavilyEstimatedCostUsd,
    openAiInspectCalls,
    openAiEstimatedCostUsd: openAiCost,
    combinedEstimatedCostUsd: usage.estimatedCostUsd,
    retained: discovery.retained,
    rejectedBeforeInspect,
    validated: toInspect,
    rows,
    usage,
    errors,
    notes: [
      ...notes,
      `Worst-case ceiling ~$${costCeiling.combinedMaxUsd.toFixed(2)} (Tavily $${costCeiling.tavilyMaxUsd.toFixed(2)} + OpenAI $${costCeiling.openAiMaxUsd.toFixed(2)}).`,
    ],
    previewId: randomUUID(),
  };
}

export function buildDiscoveryInspectPreflight(args: {
  tavilyKeyPresent: boolean;
  openAiKeyPresent: boolean;
  ceilings?: Partial<DiscoveryInspectCeilings>;
  profile?: BuyingProfile;
}) {
  const ceilings = clampDiscoveryInspectCeilings(args.ceilings);
  const plans = buildDiscoveryQueryMatrix(args.profile ?? DEFAULT_BUYING_PROFILE, {
    maxQueries: ceilings.maxQueries,
  });
  const costs = estimateDiscoveryInspectCombinedMaxCostUsd(ceilings);
  return {
    resolvedProvider: "tavily-discovery + optional-openai-inspect",
    tavilyKeyPresent: args.tavilyKeyPresent,
    openAiKeyPresent: args.openAiKeyPresent,
    exactQueryCount: plans.length,
    maxTavilyCredits: ceilings.maxTavilyCredits,
    maxInspectCandidates: ceilings.maxInspectCandidates,
    maxOpenAiInspectCalls: ceilings.maxOpenAiInspectCalls,
    openaiDiscoveryWillBeCalled: false,
    tavilyExtract: false,
    dbWritesOnPreview: false,
    estimatedMaxTavilyCostUsd: costs.tavilyMaxUsd,
    estimatedMaxOpenAiCostUsd: costs.openAiMaxUsd,
    estimatedMaxCombinedCostUsd: costs.combinedMaxUsd,
    queryIds: plans.map((p) => p.id),
    queries: plans.map((p) => ({ id: p.id, query: p.query, purpose: p.purpose })),
    ceilings,
  };
}

export { DEFAULT_DISCOVERY_INSPECT_CEILINGS, DEFAULT_DISCOVERY_BENCHMARK_CEILINGS };
