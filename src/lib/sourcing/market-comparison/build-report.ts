import { assessMarketDeal } from "@/lib/sourcing/market-comparison/assessment";
import {
  missingPreferredLeadFields,
  missingRequiredLeadFields,
} from "@/lib/sourcing/market-comparison/eligibility";
import {
  calculateLandedCost,
  hasExpenseInputs,
  vsMedian,
} from "@/lib/sourcing/market-comparison/landed-cost";
import { buildPriceSummary } from "@/lib/sourcing/market-comparison/price-analysis";
import { scoreComparables } from "@/lib/sourcing/market-comparison/scoring";
import {
  DEFAULT_MARKET_COMPARISON_RULES,
  MARKET_ASSESSMENT_LABELS,
  MARKET_COMPARISON_ASKING_PRICE_BASIS,
  MARKET_COMPARISON_DISCLAIMER,
  MARKET_COMPARISON_PURCHASE_PRICE_ONLY_LABEL,
  MARKET_CONFIDENCE_LABELS,
  type ComparableListingRaw,
  type LandedCostInput,
  type LeadComparisonSnapshot,
  type MarketComparisonReport,
  type MarketComparisonRules,
} from "@/lib/sourcing/market-comparison/types";
import type { SearchApiUsage } from "@/lib/sourcing/search/types";

const ASSESSMENT_WARNING_RE =
  /purchase-price comparison only|final assessment uses estimated landed|below comparable asking-price|above comparable asking-price|near comparable asking-price|based on public asking prices|low confidence cannot produce|fewer than \d+ verified usable|comparable asking-price median could not|material comparability problem/i;

function finishReport(options: {
  leadId: string;
  leadPrice: number;
  usable: MarketComparisonReport["usableComparables"];
  excluded: MarketComparisonReport["excludedComparables"];
  missingRequired: string[];
  missingPreferred: string[];
  landedCostInput?: Partial<LandedCostInput>;
  apiUsage: SearchApiUsage;
  comparedAt: string;
  queriesUsed: string[];
  sourcesConsulted: string[];
  warnings: string[];
  rules: MarketComparisonRules;
  provider: "openai" | "mock";
}): MarketComparisonReport {
  const priceSummary = buildPriceSummary(options.leadPrice, options.usable);
  const expensesIncluded = hasExpenseInputs(options.landedCostInput);
  const landedCost = calculateLandedCost(
    options.leadPrice,
    options.landedCostInput,
    priceSummary.medianAsking
  );

  const assessmentBasisKind = expensesIncluded ? "landed_cost" : "purchase_price";
  const assessmentBasisAmount = expensesIncluded
    ? landedCost.estimatedLandedCost
    : options.leadPrice;

  const assessed = assessMarketDeal({
    assessmentBasisAmount,
    assessmentBasisKind,
    expensesIncluded,
    medianAsking: priceSummary.medianAsking,
    usable: options.usable,
    missingPreferredCount: options.missingPreferred.length,
    rules: options.rules,
  });

  const warnings = [
    ...options.warnings.filter((w) => !ASSESSMENT_WARNING_RE.test(w)),
    ...assessed.reasons,
  ];

  return {
    leadId: options.leadId,
    comparedAt: options.comparedAt,
    provider: options.provider,
    disclaimer: MARKET_COMPARISON_DISCLAIMER,
    askingPriceBasisNotice: MARKET_COMPARISON_ASKING_PRICE_BASIS,
    assessment: assessed.assessment,
    confidence: assessed.confidence,
    assessmentLabel: MARKET_ASSESSMENT_LABELS[assessed.assessment],
    confidenceLabel: MARKET_CONFIDENCE_LABELS[assessed.confidence],
    assessmentBasisKind: assessed.assessmentBasisKind,
    assessmentBasisAmount: assessed.assessmentBasisAmount,
    assessmentBasisLabel: assessed.assessmentBasisLabel,
    expensesIncluded,
    purchasePriceOnlyLabel: expensesIncluded ? null : MARKET_COMPARISON_PURCHASE_PRICE_ONLY_LABEL,
    purchasePriceVsMedian: vsMedian(options.leadPrice, priceSummary.medianAsking),
    landedCostVsMedian: vsMedian(landedCost.estimatedLandedCost, priceSummary.medianAsking),
    eligibilityMissingRequired: options.missingRequired,
    eligibilityMissingPreferred: options.missingPreferred,
    priceSummary,
    landedCost,
    usableComparables: options.usable.filter((c) => c.listing.listingUrl?.trim()),
    excludedComparables: options.excluded,
    warnings: [...new Set(warnings)],
    queriesUsed: options.queriesUsed,
    sourcesConsulted: options.sourcesConsulted,
    apiUsage: options.apiUsage,
    rules: options.rules,
  };
}

/**
 * Rebuild assessment from an existing report when staff change expense inputs.
 * Does not call the provider — no additional OpenAI charge.
 */
export function recalculateReportWithLandedCosts(
  report: MarketComparisonReport,
  landedCostInput: Partial<LandedCostInput>
): MarketComparisonReport {
  const leadPrice = report.priceSummary?.leadPrice ?? report.landedCost?.truckPrice ?? 0;
  return finishReport({
    leadId: report.leadId,
    leadPrice,
    usable: report.usableComparables,
    excluded: report.excludedComparables,
    missingRequired: report.eligibilityMissingRequired,
    missingPreferred: report.eligibilityMissingPreferred,
    landedCostInput,
    apiUsage: report.apiUsage,
    comparedAt: report.comparedAt,
    queriesUsed: report.queriesUsed,
    sourcesConsulted: report.sourcesConsulted,
    warnings: report.warnings,
    rules: report.rules,
    provider: report.provider,
  });
}

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

  for (const c of usable) {
    if (!c.listing.listingUrl?.trim()) {
      warnings.push("Usable comparable missing listing URL — removed from summary");
    }
  }

  return finishReport({
    leadId: options.lead.id,
    leadPrice: options.lead.price ?? 0,
    usable,
    excluded,
    missingRequired,
    missingPreferred,
    landedCostInput: options.landedCostInput,
    apiUsage: options.apiUsage,
    comparedAt: options.comparedAt ?? new Date().toISOString(),
    queriesUsed: options.queriesUsed ?? [],
    sourcesConsulted: options.sourcesConsulted ?? [],
    warnings,
    rules,
    provider: options.provider ?? (options.apiUsage.live ? "openai" : "mock"),
  });
}
