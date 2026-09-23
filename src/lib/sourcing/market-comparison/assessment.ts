import {
  DEFAULT_MARKET_COMPARISON_RULES,
  type MarketAssessment,
  type MarketConfidence,
  type MarketComparisonRules,
  type PriceSummary,
  type ScoredComparable,
} from "@/lib/sourcing/market-comparison/types";

export type AssessmentResult = {
  assessment: MarketAssessment;
  confidence: MarketConfidence;
  reasons: string[];
};

/**
 * Confidence from usable count, then capped by preferred-field gaps and weak matches.
 */
export function resolveConfidence(options: {
  usableCount: number;
  missingPreferredCount: number;
  usable: ScoredComparable[];
  rules?: MarketComparisonRules;
}): MarketConfidence {
  const rules = options.rules ?? DEFAULT_MARKET_COMPARISON_RULES;
  let max: MarketConfidence = "low";
  if (options.usableCount >= rules.minUsableForAnyAssessment) {
    if (options.usableCount <= rules.usableForLowMax) max = "low";
    else if (options.usableCount <= rules.usableForMediumMax) max = "medium";
    else max = "high";
  }

  // Cap confidence when preferred lead fields are missing or matches are loose
  const weakMatches = options.usable.filter((c) => c.matchScore < 55).length;
  if (options.missingPreferredCount >= 3 || weakMatches >= Math.ceil(options.usableCount / 2)) {
    if (max === "high") max = "medium";
    if (max === "medium" && options.missingPreferredCount >= 4) max = "low";
  }
  if (options.usableCount < rules.minUsableForAnyAssessment) return "low";
  return max;
}

/**
 * Cautious deal assessment. Strong requires Medium/High confidence.
 * Never invents adjustments — uses verified asking-price median only.
 */
export function assessMarketDeal(options: {
  priceSummary: PriceSummary | null;
  usable: ScoredComparable[];
  missingPreferredCount: number;
  rules?: MarketComparisonRules;
}): AssessmentResult {
  const rules = options.rules ?? DEFAULT_MARKET_COMPARISON_RULES;
  const reasons: string[] = [];
  const count = options.usable.length;

  if (!options.priceSummary || count < rules.minUsableForAnyAssessment) {
    reasons.push(
      `Fewer than ${rules.minUsableForAnyAssessment} usable comparables with verified asking prices`
    );
    return { assessment: "insufficient_evidence", confidence: "low", reasons };
  }

  const confidence = resolveConfidence({
    usableCount: count,
    missingPreferredCount: options.missingPreferredCount,
    usable: options.usable,
    rules,
  });

  const { leadPrice, medianAsking, lowestAsking, highestAsking, pctDiffFromMedian } =
    options.priceSummary;

  if (medianAsking == null) {
    return {
      assessment: "insufficient_evidence",
      confidence: "low",
      reasons: ["Median asking price could not be calculated"],
    };
  }

  const belowStrong = leadPrice <= medianAsking * (1 - rules.materialBelowMedianPct);
  const aboveWeak = leadPrice >= medianAsking * (1 + rules.materialAboveMedianPct);
  const withinRange =
    lowestAsking != null &&
    highestAsking != null &&
    leadPrice >= lowestAsking &&
    leadPrice <= highestAsking;

  // Unreliable comparison → do not call strong
  const strongMatchCount = options.usable.filter((c) => c.matchScore >= 60).length;
  const hasMaterialDifferences = options.usable.some((c) =>
    c.differenceNotes.some((d) => /gvwr|box length|manual|not cummins|salvage/i.test(d))
  );
  const unreliable =
    confidence === "low" ||
    (hasMaterialDifferences && strongMatchCount < rules.minUsableForAnyAssessment);

  if (belowStrong && !unreliable && (confidence === "medium" || confidence === "high")) {
    reasons.push(
      `Lead price ${formatMoney(leadPrice)} is ${Math.abs(pctDiffFromMedian ?? 0)}% below median ${formatMoney(medianAsking)}`
    );
    return { assessment: "potentially_strong_deal", confidence, reasons };
  }

  if (belowStrong && unreliable) {
    reasons.push(
      "Price is below median, but confidence is low or important differences make a strong-deal label unreliable"
    );
    return { assessment: "near_comparable_asking_market", confidence, reasons };
  }

  if (aboveWeak) {
    reasons.push(
      `Lead price ${formatMoney(leadPrice)} is ${Math.abs(pctDiffFromMedian ?? 0)}% above median ${formatMoney(medianAsking)}`
    );
    return { assessment: "potentially_weak_deal", confidence, reasons };
  }

  if (withinRange || Math.abs(pctDiffFromMedian ?? 0) <= rules.materialAboveMedianPct * 100) {
    reasons.push(
      `Lead price ${formatMoney(leadPrice)} is near median ${formatMoney(medianAsking)} (${pctDiffFromMedian ?? 0}% vs median)`
    );
    return { assessment: "near_comparable_asking_market", confidence, reasons };
  }

  reasons.push("Price position relative to comparables is inconclusive");
  return { assessment: "insufficient_evidence", confidence, reasons };
}

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
