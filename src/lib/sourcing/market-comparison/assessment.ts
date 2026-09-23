import {
  DEFAULT_MARKET_COMPARISON_RULES,
  MARKET_COMPARISON_ASKING_PRICE_BASIS,
  MARKET_COMPARISON_PURCHASE_PRICE_ONLY_LABEL,
  type AssessmentBasisKind,
  type MarketAssessment,
  type MarketConfidence,
  type MarketComparisonRules,
  type ScoredComparable,
} from "@/lib/sourcing/market-comparison/types";

export type AssessmentResult = {
  assessment: MarketAssessment;
  confidence: MarketConfidence;
  reasons: string[];
  assessmentBasisKind: AssessmentBasisKind;
  assessmentBasisAmount: number;
  assessmentBasisLabel: string;
  expensesIncluded: boolean;
  askingPriceBasisNotice: string;
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

  const weakMatches = options.usable.filter((c) => c.matchScore < 55).length;
  if (options.missingPreferredCount >= 3 || weakMatches >= Math.ceil(options.usableCount / 2)) {
    if (max === "high") max = "medium";
    if (max === "medium" && options.missingPreferredCount >= 4) max = "low";
  }
  if (options.usableCount < rules.minUsableForAnyAssessment) return "low";
  return max;
}

/**
 * Material comparability problem: too few strong matches or widespread critical diffs.
 * Triggers Insufficient evidence (not a soft near-market label).
 */
export function hasMaterialComparabilityProblem(
  usable: ScoredComparable[],
  rules: MarketComparisonRules = DEFAULT_MARKET_COMPARISON_RULES
): boolean {
  if (usable.length < rules.minUsableForAnyAssessment) return false;
  const strongMatches = usable.filter((c) => c.matchScore >= 60).length;
  if (strongMatches < rules.minUsableForAnyAssessment) return true;
  const criticalDiffCount = usable.filter((c) =>
    c.differenceNotes.some((d) =>
      /gvwr|box length|manual|not cummins|salvage|model differs/i.test(d)
    )
  ).length;
  return criticalDiffCount > usable.length / 2;
}

function pctVsMedian(amount: number, median: number): number {
  return Math.round(((amount - median) / median) * 1000) / 10;
}

/**
 * Deterministic deal assessment. Precedence (first match wins):
 * 1. Fewer than 3 usable comps → Insufficient evidence
 * 2. Material comparability problem → Insufficient evidence
 * 3. Low confidence can never produce Potentially strong
 * 4. Assessment basis ≤ median × 0.90 with Medium/High → Potentially strong
 * 5. Assessment basis ≥ median × 1.10 → Potentially weak
 * 6. Otherwise → Near comparable asking market
 *
 * Assessment basis is landed cost when expenses are included; otherwise purchase price.
 * “Inside low–high range” is NOT a higher-priority rule (avoids overlap with ±10%).
 */
export function assessMarketDeal(options: {
  assessmentBasisAmount: number;
  assessmentBasisKind: AssessmentBasisKind;
  expensesIncluded: boolean;
  medianAsking: number | null;
  usable: ScoredComparable[];
  missingPreferredCount: number;
  rules?: MarketComparisonRules;
}): AssessmentResult {
  const rules = options.rules ?? DEFAULT_MARKET_COMPARISON_RULES;
  const reasons: string[] = [];
  const count = options.usable.length;
  const basisLabel =
    options.assessmentBasisKind === "landed_cost"
      ? "Estimated landed cost"
      : "Purchase/wholesale price";

  const baseMeta = {
    assessmentBasisKind: options.assessmentBasisKind,
    assessmentBasisAmount: options.assessmentBasisAmount,
    assessmentBasisLabel: basisLabel,
    expensesIncluded: options.expensesIncluded,
    askingPriceBasisNotice: MARKET_COMPARISON_ASKING_PRICE_BASIS,
  };

  // 1. Fewer than min usable
  if (count < rules.minUsableForAnyAssessment || options.medianAsking == null) {
    reasons.push(
      count < rules.minUsableForAnyAssessment
        ? `Fewer than ${rules.minUsableForAnyAssessment} verified usable comparables with asking prices supported by individual listing URLs`
        : "Comparable asking-price median could not be calculated"
    );
    if (!options.expensesIncluded) {
      reasons.push(MARKET_COMPARISON_PURCHASE_PRICE_ONLY_LABEL);
    }
    reasons.push(MARKET_COMPARISON_ASKING_PRICE_BASIS);
    return {
      assessment: "insufficient_evidence",
      confidence: "low",
      reasons,
      ...baseMeta,
    };
  }

  // 2. Material comparability problem
  if (hasMaterialComparabilityProblem(options.usable, rules)) {
    reasons.push(
      "Material comparability problem (weak matches or important differences such as GVWR, box length, drivetrain, or model) — comparison is unreliable"
    );
    reasons.push(MARKET_COMPARISON_ASKING_PRICE_BASIS);
    return {
      assessment: "insufficient_evidence",
      confidence: resolveConfidence({
        usableCount: count,
        missingPreferredCount: options.missingPreferredCount,
        usable: options.usable,
        rules,
      }),
      reasons,
      ...baseMeta,
    };
  }

  const confidence = resolveConfidence({
    usableCount: count,
    missingPreferredCount: options.missingPreferredCount,
    usable: options.usable,
    rules,
  });

  const median = options.medianAsking;
  const basis = options.assessmentBasisAmount;
  const pct = pctVsMedian(basis, median);
  const belowStrong = basis <= median * (1 - rules.materialBelowMedianPct);
  const aboveWeak = basis >= median * (1 + rules.materialAboveMedianPct);

  if (!options.expensesIncluded) {
    reasons.push(MARKET_COMPARISON_PURCHASE_PRICE_ONLY_LABEL);
  } else {
    reasons.push("Final assessment uses estimated landed cost (truck price + entered expenses)");
  }

  // 3 + 4. Strong only with Medium/High (low confidence never produces strong)
  if (belowStrong && (confidence === "medium" || confidence === "high")) {
    reasons.push(
      `${basisLabel} ${formatMoney(basis)} is ${Math.abs(pct)}% below comparable asking-price median ${formatMoney(median)}`
    );
    reasons.push(MARKET_COMPARISON_ASKING_PRICE_BASIS);
    return {
      assessment: "potentially_strong_deal",
      confidence,
      reasons,
      ...baseMeta,
    };
  }

  if (belowStrong && confidence === "low") {
    reasons.push(
      `${basisLabel} is below comparable asking-price median, but Low confidence cannot produce a Potentially strong deal label`
    );
    reasons.push(MARKET_COMPARISON_ASKING_PRICE_BASIS);
    return {
      assessment: "near_comparable_asking_market",
      confidence,
      reasons,
      ...baseMeta,
    };
  }

  // 5. Weak
  if (aboveWeak) {
    reasons.push(
      `${basisLabel} ${formatMoney(basis)} is ${Math.abs(pct)}% above comparable asking-price median ${formatMoney(median)}`
    );
    reasons.push(MARKET_COMPARISON_ASKING_PRICE_BASIS);
    return {
      assessment: "potentially_weak_deal",
      confidence,
      reasons,
      ...baseMeta,
    };
  }

  // 6. Otherwise near
  reasons.push(
    `${basisLabel} ${formatMoney(basis)} is near comparable asking-price median ${formatMoney(median)} (${pct}% vs median)`
  );
  reasons.push(MARKET_COMPARISON_ASKING_PRICE_BASIS);
  return {
    assessment: "near_comparable_asking_market",
    confidence,
    reasons,
    ...baseMeta,
  };
}

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
