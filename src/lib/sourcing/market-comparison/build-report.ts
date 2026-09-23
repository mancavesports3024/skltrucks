import { assessMarketDeal } from "@/lib/sourcing/market-comparison/assessment";
import {
  isLeadEligibleForMarketComparison,
  missingPreferredLeadFields,
  missingRequiredLeadFields,
} from "@/lib/sourcing/market-comparison/eligibility";
import { calculateLandedCost } from "@/lib/sourcing/market-comparison/landed-cost";
import { buildPriceSummary } from "@/lib/sourcing/market-comparison/price-analysis";
import { scoreComparables } from "@/lib/sourcing/market-comparison/scoring";
import {
  DEFAULT_MARKET_COMPARISON_RULES,
  MARKET_ASSESSMENT_LABELS,
  MARKET_COMPARISON_DISCLAIMER,
  MARKET_CONFIDENCE_LABELS,
  type ComparableListingRaw,
  type LandedCostInput,
  type LeadComparisonSnapshot,
  type MarketComparisonReport,
  type MarketComparisonRules,
} from "@/lib/sourcing/market-comparison/types";
import type { SearchApiUsage } from "@/lib/sourcing/search/types";

export function buildMarketComparisonReport(options: {
  lead: LeadComparisonSnapshot;
  listings: ComparableListingRaw[];
  apiUsage: SearchApiUsage;
  comparedAt?: string;
  queriesUsed?: string[];
  sourcesConsulted?: string[];
  warnings?: string[];
  landedCostInput?: Partial<LandedCostInput>;
  rules?: MarketComparisonRules;
  provider?: "openai" | "mock";
}): MarketComparisonReport {
  const rules = options.rules ?? DEFAULT_MARKET_COMPARISON_RULES;
  const missingRequired = missingRequiredLeadFields(options.lead);
  const missingPreferred = missingPreferredLeadFields(options.lead);
  const warnings = [...(options.warnings ?? [])];

  if (missingRequired.length) {
    warnings.push(`Missing required lead fields: ${missingRequired.join(", ")}`);
  }
  if (missingPreferred.length) {
    warnings.push(`Missing preferred lead fields: ${missingPreferred.join(", ")}`);
  }

  const { usable, excluded } = scoreComparables(options.lead, options.listings, rules);

  const leadPrice = options.lead.price ?? 0;
  const priceSummary =
    isLeadEligibleForMarketComparison(options.lead) && usable.length
      ? buildPriceSummary(leadPrice, usable)
      : isLeadEligibleForMarketComparison(options.lead)
        ? buildPriceSummary(leadPrice, [])
        : null;

  const assessed = assessMarketDeal({
    priceSummary,
    usable,
    missingPreferredCount: missingPreferred.length,
    rules,
  });
  warnings.push(...assessed.reasons);

  const landedCost =
    options.lead.price != null
      ? calculateLandedCost(
          options.lead.price,
          options.landedCostInput,
          priceSummary?.medianAsking ?? null
        )
      : null;

  // Every usable comparable must retain a listing URL (traceability).
  for (const c of usable) {
    if (!c.listing.listingUrl?.trim()) {
      warnings.push("Usable comparable missing listing URL — removed from summary");
    }
  }

  return {
    leadId: options.lead.id,
    comparedAt: options.comparedAt ?? new Date().toISOString(),
    provider: options.provider ?? (options.apiUsage.live ? "openai" : "mock"),
    disclaimer: MARKET_COMPARISON_DISCLAIMER,
    assessment: assessed.assessment,
    confidence: assessed.confidence,
    assessmentLabel: MARKET_ASSESSMENT_LABELS[assessed.assessment],
    confidenceLabel: MARKET_CONFIDENCE_LABELS[assessed.confidence],
    eligibilityMissingRequired: missingRequired,
    eligibilityMissingPreferred: missingPreferred,
    priceSummary,
    landedCost,
    usableComparables: usable.filter((c) => c.listing.listingUrl?.trim()),
    excludedComparables: excluded,
    warnings: [...new Set(warnings)],
    queriesUsed: options.queriesUsed ?? [],
    sourcesConsulted: options.sourcesConsulted ?? [],
    apiUsage: options.apiUsage,
    rules,
  };
}
