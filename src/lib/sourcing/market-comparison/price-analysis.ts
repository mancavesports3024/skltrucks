import type { PriceSummary, ScoredComparable } from "@/lib/sourcing/market-comparison/types";

export function medianNumber(values: number[]): number | null {
  const sorted = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Build price summary from usable comparables + lead asking/wholesale price. */
export function buildPriceSummary(
  leadPrice: number,
  usable: ScoredComparable[]
): PriceSummary {
  const prices = usable
    .map((c) => c.listing.askingPrice)
    .filter((p): p is number => p != null && Number.isFinite(p) && p > 0);
  const mileages = usable
    .map((c) => c.listing.mileage)
    .filter((m): m is number => m != null && Number.isFinite(m));
  const years = usable
    .map((c) => c.listing.year)
    .filter((y): y is number => y != null && Number.isFinite(y));

  const lowestAsking = prices.length ? Math.min(...prices) : null;
  const highestAsking = prices.length ? Math.max(...prices) : null;
  const medianAsking = medianNumber(prices);

  let dollarDiffFromMedian: number | null = null;
  let pctDiffFromMedian: number | null = null;
  if (medianAsking != null && medianAsking > 0 && Number.isFinite(leadPrice)) {
    dollarDiffFromMedian = leadPrice - medianAsking;
    pctDiffFromMedian = Math.round((dollarDiffFromMedian / medianAsking) * 1000) / 10;
  }

  return {
    usableCount: usable.length,
    lowestAsking,
    medianAsking,
    highestAsking,
    leadPrice,
    dollarDiffFromMedian,
    pctDiffFromMedian,
    mileageMin: mileages.length ? Math.min(...mileages) : null,
    mileageMax: mileages.length ? Math.max(...mileages) : null,
    yearMin: years.length ? Math.min(...years) : null,
    yearMax: years.length ? Math.max(...years) : null,
  };
}
