import type {
  LandedCostInput,
  LandedCostSummary,
  PriceVsMedian,
} from "@/lib/sourcing/market-comparison/types";

export const EMPTY_LANDED_COST_INPUT: LandedCostInput = {
  transportation: 0,
  inspection: 0,
  repairs: 0,
  fees: 0,
  otherCosts: 0,
  desiredGrossMargin: 0,
};

function nonNeg(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** True when any staff-entered expense (not desired margin) is > 0. */
export function hasExpenseInputs(input: Partial<LandedCostInput> | null | undefined): boolean {
  if (!input) return false;
  return (
    nonNeg(input.transportation) > 0 ||
    nonNeg(input.inspection) > 0 ||
    nonNeg(input.repairs) > 0 ||
    nonNeg(input.fees) > 0 ||
    nonNeg(input.otherCosts) > 0
  );
}

export function expenseTotal(input: Partial<LandedCostInput> | null | undefined): number {
  if (!input) return 0;
  return (
    nonNeg(input.transportation) +
    nonNeg(input.inspection) +
    nonNeg(input.repairs) +
    nonNeg(input.fees) +
    nonNeg(input.otherCosts)
  );
}

export function vsMedian(amount: number, medianAsking: number | null): PriceVsMedian {
  if (medianAsking == null || !Number.isFinite(medianAsking) || medianAsking <= 0) {
    return { amount, dollarDiffFromMedian: null, pctDiffFromMedian: null };
  }
  const dollarDiffFromMedian = amount - medianAsking;
  const pctDiffFromMedian = Math.round((dollarDiffFromMedian / medianAsking) * 1000) / 10;
  return { amount, dollarDiffFromMedian, pctDiffFromMedian };
}

/**
 * Estimated landed cost — staff-entered adders only.
 * Does not include financing, taxes, warranty, holding cost, or negotiated sale assumptions.
 * approximateGrossMarginOpportunity is asking-median minus landed cost — not profit.
 */
export function calculateLandedCost(
  truckPrice: number,
  input: Partial<LandedCostInput> = {},
  medianAsking: number | null = null
): LandedCostSummary {
  const inputs: LandedCostInput = {
    transportation: nonNeg(input.transportation),
    inspection: nonNeg(input.inspection),
    repairs: nonNeg(input.repairs),
    fees: nonNeg(input.fees),
    otherCosts: nonNeg(input.otherCosts),
    desiredGrossMargin: nonNeg(input.desiredGrossMargin),
  };
  const price = nonNeg(truckPrice);
  const estimatedLandedCost =
    price +
    inputs.transportation +
    inputs.inspection +
    inputs.repairs +
    inputs.fees +
    inputs.otherCosts;

  const expensesIncluded = hasExpenseInputs(inputs);

  const landedVsMedian =
    medianAsking != null && Number.isFinite(medianAsking) ? estimatedLandedCost - medianAsking : null;

  const approximateGrossMarginOpportunity =
    medianAsking != null && Number.isFinite(medianAsking)
      ? medianAsking - estimatedLandedCost
      : null;

  const breakEvenResalePrice = estimatedLandedCost + inputs.desiredGrossMargin;

  return {
    truckPrice: price,
    estimatedLandedCost,
    landedVsMedian,
    approximateGrossMarginOpportunity,
    breakEvenResalePrice,
    inputs,
    expensesIncluded,
  };
}

export function parseLandedCostFromForm(formData: FormData): LandedCostInput {
  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").replace(/[$,\s]/g, "");
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    transportation: num("transportation"),
    inspection: num("inspection"),
    repairs: num("repairs"),
    fees: num("fees"),
    otherCosts: num("otherCosts"),
    desiredGrossMargin: num("desiredGrossMargin"),
  };
}
