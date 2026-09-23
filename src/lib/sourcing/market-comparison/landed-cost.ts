import type { LandedCostInput, LandedCostSummary } from "@/lib/sourcing/market-comparison/types";

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

/**
 * Estimated landed cost — staff-entered adders only.
 * Does not include financing, taxes, warranty, holding cost, or negotiated sale assumptions.
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
