/**
 * Market comparison pilot — types and configurable thresholds.
 * Decision support only; not an appraisal or guaranteed resale value.
 */

import type { SearchApiUsage } from "@/lib/sourcing/search/types";

export const MARKET_COMPARISON_DISCLAIMER =
  "Market comparison uses public asking prices, not verified sale prices. Confirm availability, specifications, condition, and negotiated price before purchasing.";

/** Shown on every assessment result. */
export const MARKET_COMPARISON_ASKING_PRICE_BASIS =
  "Based on public asking prices, not completed sale prices.";

export const MARKET_COMPARISON_PURCHASE_PRICE_ONLY_LABEL =
  "Purchase-price comparison only — expenses not included";

export const MARKET_COMPARISON_PENDING_LABEL = "Comparing current market listings…";
export const MARKET_COMPARISON_CONFIRM_FIELD = "confirmPaidSearch";
export const MARKET_COMPARISON_CONFIRM_VALUE = "1";

/**
 * Hard per-run web_search tool ceiling (OpenAI).
 * Four calls cannot reliably open and verify 5–10 individual unit pages.
 * Twelve calls support discovery + verifying roughly 3–6 individual listings.
 */
export const MARKET_COMPARISON_MAX_TOOL_CALLS = 12;

/** Target verified usable comps this budget can support (not a guarantee). */
export const MARKET_COMPARISON_TARGET_VERIFIED_MIN = 3;
export const MARKET_COMPARISON_TARGET_VERIFIED_MAX = 6;

/**
 * Realistic cost band for staff confirmation (gpt-4o-mini + web_search):
 * ~12 × $0.01 search + ~60–120k tokens ≈ $0.12–$0.22 typical; hard ceiling $0.25.
 */
export const MARKET_COMPARISON_TYPICAL_COST_USD_MIN = 0.12;
export const MARKET_COMPARISON_TYPICAL_COST_USD_MAX = 0.22;
export const MARKET_COMPARISON_MAX_EXPECTED_COST_USD = 0.25;

export type MarketConfidence = "low" | "medium" | "high";
export type MarketAssessment =
  | "potentially_strong_deal"
  | "near_comparable_asking_market"
  | "potentially_weak_deal"
  | "insufficient_evidence";

export type AssessmentBasisKind = "purchase_price" | "landed_cost";

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
  /** Assessment basis ≤ median × (1 − this) may be "strong" when confidence allows. */
  materialBelowMedianPct: number;
  /** Assessment basis ≥ median × (1 + this) may be "weak". */
  materialAboveMedianPct: number;
  maxGvwrLbs: number;
  /** Cap usable verified comps retained in a report. */
  maxUsableComparables: number;
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
  maxUsableComparables: MARKET_COMPARISON_TARGET_VERIFIED_MAX,
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

/** Provenance for required comparable fields — must cite the individual listing page. */
export type ComparableFieldEvidence = {
  askingPrice: string;
  year: string;
  makeModel: string;
  mileage: string;
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
  /** Free-text notes — never invent. */
  evidenceNotes: string;
  /** VIN when present on the listing (dedupe across marketplaces). */
  vin: string;
  /** Stock / unit number when present. */
  stockNumber: string;
  /**
   * True only when the provider inspected or otherwise supported the individual
   * listing page. Search-result snippets alone are not sufficient.
   */
  listingPageInspected: boolean;
  /** Structured quotes/provenance for required fields, tied to this listing URL. */
  fieldEvidence: ComparableFieldEvidence;
};

export type ComparableExclusionReason =
  | "invalid_or_hub_url"
  | "duplicate_url"
  | "duplicate_vehicle"
  | "missing_asking_price"
  | "missing_mileage"
  | "auction_without_asking_price"
  | "salvage_or_damaged"
  | "reefer"
  | "manual_transmission"
  | "over_max_gvwr"
  | "cab_chassis_without_box"
  | "insufficient_identity"
  | "sold_historical"
  | "unverified_listing_evidence"
  | "unsupported_required_field"
  | "field_evidence_mismatch";

export type ScoredComparable = {
  listing: ComparableListingRaw;
  usable: boolean;
  exclusionReason?: ComparableExclusionReason;
  matchScore: number;
  includeReasons: string[];
  differenceNotes: string[];
  canonicalUrl: string;
};

export type PriceVsMedian = {
  amount: number;
  dollarDiffFromMedian: number | null;
  pctDiffFromMedian: number | null;
};

export type PriceSummary = {
  usableCount: number;
  lowestAsking: number | null;
  /** Comparable asking-price median (not “market value”). */
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
  /** Asking-median minus landed cost — not profit. */
  approximateGrossMarginOpportunity: number | null;
  breakEvenResalePrice: number;
  inputs: LandedCostInput;
  expensesIncluded: boolean;
};

export type MarketComparisonReport = {
  leadId: string;
  comparedAt: string;
  provider: "openai" | "mock";
  disclaimer: string;
  askingPriceBasisNotice: string;
  assessment: MarketAssessment;
  confidence: MarketConfidence;
  assessmentLabel: string;
  confidenceLabel: string;
  /** Which figure drove strong/near/weak. */
  assessmentBasisKind: AssessmentBasisKind;
  assessmentBasisAmount: number;
  assessmentBasisLabel: string;
  expensesIncluded: boolean;
  purchasePriceOnlyLabel: string | null;
  purchasePriceVsMedian: PriceVsMedian | null;
  landedCostVsMedian: PriceVsMedian | null;
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
