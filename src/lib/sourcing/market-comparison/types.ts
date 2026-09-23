/**
 * Market comparison pilot — types and configurable thresholds.
 * Decision support only; not an appraisal or guaranteed resale value.
 */

import type { SearchApiUsage } from "@/lib/sourcing/search/types";

export const MARKET_COMPARISON_DISCLAIMER =
  "Market comparison uses public asking prices, not verified sale prices. Confirm availability, specifications, condition, and negotiated price before purchasing.";

export const MARKET_COMPARISON_PENDING_LABEL = "Comparing current market listings…";
export const MARKET_COMPARISON_CONFIRM_FIELD = "confirmPaidSearch";
export const MARKET_COMPARISON_CONFIRM_VALUE = "1";

/** Strict per-run web_search tool ceiling (OpenAI). */
export const MARKET_COMPARISON_MAX_TOOL_CALLS = 4;

/**
 * Rough upper bound for staff confirmation copy:
 * 4 × $0.01 web_search + ~40k in / 8k out tokens on gpt-4o-mini ≈ $0.05–$0.07.
 */
export const MARKET_COMPARISON_MAX_EXPECTED_COST_USD = 0.08;

export type MarketConfidence = "low" | "medium" | "high";
export type MarketAssessment =
  | "potentially_strong_deal"
  | "near_comparable_asking_market"
  | "potentially_weak_deal"
  | "insufficient_evidence";

export const MARKET_ASSESSMENT_LABELS: Record<MarketAssessment, string> = {
  potentially_strong_deal: "Potentially strong deal",
  near_comparable_asking_market: "Near comparable asking market",
  potentially_weak_deal: "Potentially weak deal",
  insufficient_evidence: "Insufficient evidence",
};

export const MARKET_CONFIDENCE_LABELS: Record<MarketConfidence, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Tunable assessment thresholds (pure / unit-tested). */
export type MarketComparisonRules = {
  minUsableForAnyAssessment: number;
  usableForLowMax: number;
  usableForMediumMax: number;
  /** Prefer year within ± this many years. */
  preferredYearDelta: number;
  /** Prefer mileage within ± this many miles. */
  preferredMileageDelta: number;
  /** Lead price ≤ median × (1 − this) may be "strong" when confidence allows. */
  materialBelowMedianPct: number;
  /** Lead price ≥ median × (1 + this) may be "weak". */
  materialAboveMedianPct: number;
  maxGvwrLbs: number;
};

export const DEFAULT_MARKET_COMPARISON_RULES: MarketComparisonRules = {
  minUsableForAnyAssessment: 3,
  usableForLowMax: 4,
  usableForMediumMax: 7,
  preferredYearDelta: 2,
  preferredMileageDelta: 75_000,
  materialBelowMedianPct: 0.1,
  materialAboveMedianPct: 0.1,
  maxGvwrLbs: 26_000,
};

export type LeadComparisonSnapshot = {
  id: string;
  year: number | null;
  makeModel: string;
  mileage: number | null;
  price: number | null;
  boxLengthFt: number | null;
  engine: string;
  engineIsCummins: boolean | null;
  transmission: string;
  transmissionIsAutomatic: boolean | null;
  manufacturerGvwrLbs: number | null;
  listedWeightLbs: number | null;
  hasLiftgate: boolean | null;
  location: string;
};

export type ComparableListingRaw = {
  listingUrl: string;
  sourceName: string;
  year: number | null;
  makeModel: string;
  mileage: number | null;
  askingPrice: number | null;
  auctionCurrentBid: number | null;
  boxLengthFt: number | null;
  bodyType: string;
  engine: string;
  engineIsCummins: boolean | null;
  transmission: string;
  transmissionIsAutomatic: boolean | null;
  manufacturerGvwrLbs: number | null;
  hasLiftgate: boolean | null;
  location: string;
  conditionNotes: string;
  statusNotes: string;
  /** Provider claims — never invent. */
  evidenceNotes: string;
};

export type ComparableExclusionReason =
  | "invalid_or_hub_url"
  | "duplicate_url"
  | "missing_asking_price"
  | "missing_mileage"
  | "auction_without_asking_price"
  | "salvage_or_damaged"
  | "reefer"
  | "manual_transmission"
  | "over_max_gvwr"
  | "cab_chassis_without_box"
  | "insufficient_identity"
  | "sold_historical";

export type ScoredComparable = {
  listing: ComparableListingRaw;
  usable: boolean;
  exclusionReason?: ComparableExclusionReason;
  matchScore: number;
  includeReasons: string[];
  differenceNotes: string[];
  canonicalUrl: string;
};

export type PriceSummary = {
  usableCount: number;
  lowestAsking: number | null;
  medianAsking: number | null;
  highestAsking: number | null;
  leadPrice: number;
  dollarDiffFromMedian: number | null;
  pctDiffFromMedian: number | null;
  mileageMin: number | null;
  mileageMax: number | null;
  yearMin: number | null;
  yearMax: number | null;
};

export type LandedCostInput = {
  transportation: number;
  inspection: number;
  repairs: number;
  fees: number;
  otherCosts: number;
  desiredGrossMargin: number;
};

export type LandedCostSummary = {
  truckPrice: number;
  estimatedLandedCost: number;
  landedVsMedian: number | null;
  approximateGrossMarginOpportunity: number | null;
  breakEvenResalePrice: number;
  inputs: LandedCostInput;
};

export type MarketComparisonReport = {
  leadId: string;
  comparedAt: string;
  provider: "openai" | "mock";
  disclaimer: string;
  assessment: MarketAssessment;
  confidence: MarketConfidence;
  assessmentLabel: string;
  confidenceLabel: string;
  eligibilityMissingRequired: string[];
  eligibilityMissingPreferred: string[];
  priceSummary: PriceSummary | null;
  landedCost: LandedCostSummary | null;
  usableComparables: ScoredComparable[];
  excludedComparables: ScoredComparable[];
  warnings: string[];
  queriesUsed: string[];
  sourcesConsulted: string[];
  apiUsage: SearchApiUsage;
  rules: MarketComparisonRules;
};

export type MarketComparisonRecord = {
  id: string;
  leadId: string;
  status: "completed" | "failed";
  assessment: MarketAssessment | null;
  confidence: MarketConfidence | null;
  report: MarketComparisonReport | null;
  apiUsage: SearchApiUsage | null;
  errorMessage: string | null;
  createdBy: string;
  createdAt: string;
};
