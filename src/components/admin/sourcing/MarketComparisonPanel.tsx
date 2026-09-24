"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import DrivingDistanceControls, {
  type CostSource,
} from "@/components/admin/sourcing/DrivingDistanceControls";
import type { DrivingRouteCache } from "@/lib/sourcing/distance/google-routes";
import { recalculateReportWithLandedCosts } from "@/lib/sourcing/market-comparison/build-report";
import {
  EMPTY_LANDED_COST_INPUT,
  hasExpenseInputs,
} from "@/lib/sourcing/market-comparison/landed-cost";
import {
  MARKET_COMPARISON_CONFIRM_FIELD,
  MARKET_COMPARISON_CONFIRM_VALUE,
  MARKET_COMPARISON_DISCLAIMER,
  MARKET_COMPARISON_MAX_EXPECTED_COST_USD,
  MARKET_COMPARISON_PENDING_LABEL,
  MARKET_COMPARISON_TYPICAL_COST_USD_MAX,
  MARKET_COMPARISON_TYPICAL_COST_USD_MIN,
  type LandedCostInput,
  type MarketComparisonRecord,
  type MarketComparisonReport,
} from "@/lib/sourcing/market-comparison/types";

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
      aria-hidden="true"
    />
  );
}

function CompareSubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  const busy = pending || Boolean(disabled);
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy}
      aria-disabled={busy}
      className="min-h-12 bg-[#fc0527] px-6 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="inline-flex items-center gap-2">
        {pending ? <Spinner /> : null}
        {pending ? MARKET_COMPARISON_PENDING_LABEL : "Compare market"}
      </span>
    </button>
  );
}

function ComparePendingStatus() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm font-medium text-neutral-800">
      {MARKET_COMPARISON_PENDING_LABEL}
    </p>
  );
}

type CostDraft = LandedCostInput;

type Props = {
  leadId: string;
  eligible: boolean;
  missingRequired: string[];
  missingPreferred: string[];
  latest: MarketComparisonRecord | null;
  action: (formData: FormData) => Promise<void>;
  error?: string | null;
  justCompleted?: MarketComparisonReport | null;
  drivingRouteCache: DrivingRouteCache | null;
  straightLineMiles: number | null;
  distanceIsEstimate: boolean;
  transportationRatePerMile: number;
  defaultInspectionCost: number;
};

export default function MarketComparisonPanel({
  leadId,
  eligible,
  missingRequired,
  missingPreferred,
  latest,
  action,
  error,
  justCompleted,
  drivingRouteCache,
  straightLineMiles,
  distanceIsEstimate,
  transportationRatePerMile,
  defaultInspectionCost,
}: Props) {
  const baseReport = justCompleted || latest?.report || null;
  const [costs, setCosts] = useState<CostDraft>(() => {
    const seeded = latest?.report?.landedCost?.inputs;
    return seeded && hasExpenseInputs(seeded) ? { ...EMPTY_LANDED_COST_INPUT, ...seeded } : EMPTY_LANDED_COST_INPUT;
  });
  const [displayReport, setDisplayReport] = useState<MarketComparisonReport | null>(baseReport);
  const [transportationSource, setTransportationSource] = useState<CostSource>(() =>
    (latest?.report?.landedCost?.inputs?.transportation ?? 0) > 0 ? "staff_override" : "profile_default"
  );
  const [inspectionSource, setInspectionSource] = useState<CostSource>(() =>
    (latest?.report?.landedCost?.inputs?.inspection ?? 0) > 0 ? "staff_override" : "profile_default"
  );

  // Keep report view in sync with the latest comparison payload — do not clobber
  // locally auto-populated Transportation/Inspection with stale zero inputs.
  useEffect(() => {
    setDisplayReport((prev) => {
      if (!baseReport) return prev;
      if (hasExpenseInputs(costs)) {
        return recalculateReportWithLandedCosts(baseReport, costs);
      }
      return baseReport;
    });
    // Intentionally depends on baseReport only: cost-driven recalcs happen in applyCostPatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseReport]);

  // Adopt inputs only when a NEW comparison completes (form-submitted costs).
  // Do not wipe Transportation/Inspection that were auto-populated from Google/profile
  // when the completed report still has zeros for those fields.
  useEffect(() => {
    if (!justCompleted?.landedCost?.inputs) return;
    const inputs = justCompleted.landedCost.inputs;
    setCosts((prev) => {
      const next = {
        ...EMPTY_LANDED_COST_INPUT,
        ...inputs,
        transportation: inputs.transportation > 0 ? inputs.transportation : prev.transportation,
        inspection: inputs.inspection > 0 ? inputs.inspection : prev.inspection,
      };
      setDisplayReport(
        hasExpenseInputs(next)
          ? recalculateReportWithLandedCosts(justCompleted, next)
          : justCompleted
      );
      return next;
    });
    if (inputs.transportation > 0) setTransportationSource("staff_override");
    if (inputs.inspection > 0) setInspectionSource("staff_override");
  }, [justCompleted]);

  /**
   * Single atomic cost write so Transportation + Inspection updates cannot
   * clobber each other via stale React state closures.
   */
  function applyCostPatch(
    patch: Partial<CostDraft>,
    sources?: Partial<{ transportation: CostSource; inspection: CostSource }>
  ) {
    setCosts((prev) => {
      const next: CostDraft = { ...prev, ...patch };
      if (baseReport) {
        // Local recalculation — no paid search / no Google / no Tavily.
        setDisplayReport(recalculateReportWithLandedCosts(baseReport, next));
      }
      return next;
    });
    if (sources?.transportation) setTransportationSource(sources.transportation);
    if (sources?.inspection) setInspectionSource(sources.inspection);
  }

  function updateCost<K extends keyof CostDraft>(key: K, raw: string) {
    const n = Number(String(raw).replace(/[$,\s]/g, ""));
    const value = Number.isFinite(n) && n > 0 ? n : 0;
    applyCostPatch(
      { [key]: value } as Partial<CostDraft>,
      key === "transportation"
        ? { transportation: "staff_override" }
        : key === "inspection"
          ? { inspection: "staff_override" }
          : undefined
    );
  }

  function applyRouteCostDefaults(update: {
    transportationUsd: number | null;
    inspectionUsd: number | null;
    transportationSource?: CostSource;
    inspectionSource?: CostSource;
  }) {
    const patch: Partial<CostDraft> = {};
    const sources: Partial<{ transportation: CostSource; inspection: CostSource }> = {};
    if (update.transportationUsd != null && Number.isFinite(update.transportationUsd)) {
      patch.transportation = update.transportationUsd;
      if (update.transportationSource) sources.transportation = update.transportationSource;
    }
    if (update.inspectionUsd != null && Number.isFinite(update.inspectionUsd)) {
      patch.inspection = update.inspectionUsd;
      if (update.inspectionSource) sources.inspection = update.inspectionSource;
    }
    if (Object.keys(patch).length === 0) return;
    applyCostPatch(patch, sources);
  }

  return (
    <section
      className="space-y-4 border border-neutral-200 bg-white p-4 sm:p-6"
      data-testid="market-comparison-panel"
      aria-labelledby="market-comparison-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="market-comparison-heading" className="text-base font-bold text-neutral-900">
            Market comparison
          </h3>
          <p className="mt-1 text-sm text-neutral-600">
            Decision support only — not an appraisal or guaranteed resale value.
          </p>
        </div>
      </div>

      <div
        role="note"
        className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
      >
        {MARKET_COMPARISON_DISCLAIMER}
      </div>

      <DrivingDistanceControls
        leadId={leadId}
        initialCache={drivingRouteCache}
        straightLineMiles={straightLineMiles}
        distanceIsEstimate={distanceIsEstimate}
        transportationRatePerMile={transportationRatePerMile}
        defaultInspectionCost={defaultInspectionCost}
        transportation={costs.transportation}
        inspection={costs.inspection}
        onApplyRouteCostDefaults={applyRouteCostDefaults}
        transportationSource={transportationSource}
        inspectionSource={inspectionSource}
      />

      {!eligible ? (
        <div role="alert" className="border border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-800">
          <p className="font-semibold">Compare market is disabled until required fields are present:</p>
          <ul className="mt-2 list-disc pl-5">
            {missingRequired.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="leadId" value={leadId} />
          {missingPreferred.length > 0 && (
            <p className="text-sm text-amber-800">
              Preferred fields missing (confidence may be capped): {missingPreferred.join(", ")}
            </p>
          )}
          <label className="flex items-start gap-2 text-sm text-neutral-800">
            <input
              type="checkbox"
              name={MARKET_COMPARISON_CONFIRM_FIELD}
              value={MARKET_COMPARISON_CONFIRM_VALUE}
              required
              className="mt-1"
            />
            <span>
              I understand this runs a paid OpenAI web search (typically about $
              {MARKET_COMPARISON_TYPICAL_COST_USD_MIN.toFixed(2)}–$
              {MARKET_COMPARISON_TYPICAL_COST_USD_MAX.toFixed(2)}, hard ceiling $
              {MARKET_COMPARISON_MAX_EXPECTED_COST_USD.toFixed(2)}) and will not create an automatic
              buy decision.
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["transportation", "Transportation"],
                ["inspection", "Inspection"],
                ["repairs", "Repairs/reconditioning"],
                ["fees", "Buyer/auction fees"],
                ["otherCosts", "Other costs"],
                ["desiredGrossMargin", "Desired gross margin"],
              ] as const
            ).map(([name, label]) => (
              <label key={name} className="block text-sm">
                <span className="font-semibold text-neutral-800">{label} (optional)</span>
                <input
                  name={name}
                  type="number"
                  min={0}
                  step="0.01"
                  value={costs[name] || ""}
                  onChange={(e) => updateCost(name, e.target.value)}
                  className="mt-1 w-full border border-neutral-300 px-3 py-2"
                  placeholder="0"
                />
              </label>
            ))}
          </div>
          {baseReport ? (
            <p className="text-sm text-neutral-700">
              Changing expenses recalculates the assessment locally from the last verified
              comparables — <strong>no additional paid search</strong> and no Google Routes call.
              Re-run Compare market only when you need fresh listings (that incurs another charge).
            </p>
          ) : null}
          {hasExpenseInputs(costs) ? (
            <p className="text-sm font-medium text-neutral-800">
              Entered expenses are included in the final assessment (landed-cost basis).
            </p>
          ) : (
            <p className="text-sm text-neutral-600">
              No expenses entered yet — assessment will use purchase-price comparison only until
              costs are added.
            </p>
          )}
          <CompareSubmitButton />
          <ComparePendingStatus />
        </form>
      )}

      {error && (
        <div role="alert" aria-live="assertive" className="border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {displayReport && <ComparisonReportView report={displayReport} />}
    </section>
  );
}

function ComparisonReportView({ report }: { report: MarketComparisonReport }) {
  const ps = report.priceSummary;
  const lc = report.landedCost;

  return (
    <div className="space-y-4 border-t border-neutral-200 pt-4" data-testid="market-comparison-report">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="bg-neutral-50 p-3">
          <p className="text-xs uppercase text-neutral-500">Assessment</p>
          <p className="text-lg font-bold text-neutral-900">{report.assessmentLabel}</p>
          <p className="text-sm text-neutral-700">Confidence: {report.confidenceLabel}</p>
          <p className="mt-2 text-sm text-neutral-800" data-testid="assessment-basis">
            Assessment basis: <strong>{report.assessmentBasisLabel}</strong>{" "}
            ({money(report.assessmentBasisAmount)})
          </p>
          {report.purchasePriceOnlyLabel ? (
            <p className="mt-1 text-sm font-medium text-amber-900">{report.purchasePriceOnlyLabel}</p>
          ) : (
            <p className="mt-1 text-sm text-neutral-700">
              Expenses included in final assessment (landed-cost basis).
            </p>
          )}
          <p className="mt-2 text-xs text-neutral-600">{report.askingPriceBasisNotice}</p>
        </div>
        <div className="bg-neutral-50 p-3 text-sm">
          <p>
            Purchase/wholesale price:{" "}
            <strong>{money(ps?.leadPrice ?? report.landedCost?.truckPrice)}</strong>
          </p>
          <p>
            Est. landed cost: <strong>{money(lc?.estimatedLandedCost)}</strong>
          </p>
          <p className="text-neutral-600">
            Compared {new Date(report.comparedAt).toLocaleString()} · Provider {report.provider}
          </p>
        </div>
      </div>

      {ps && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="mb-2 text-left text-xs font-semibold uppercase text-neutral-500">
              Comparable asking-price summary ({ps.usableCount} verified usable)
            </caption>
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-2">Low</th>
                <th className="px-3 py-2">Comparable asking-price median</th>
                <th className="px-3 py-2">High</th>
                <th className="px-3 py-2">Years</th>
                <th className="px-3 py-2">Mileage</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-neutral-100">
                <td className="px-3 py-2">{money(ps.lowestAsking)}</td>
                <td className="px-3 py-2">{money(ps.medianAsking)}</td>
                <td className="px-3 py-2">{money(ps.highestAsking)}</td>
                <td className="px-3 py-2">
                  {ps.yearMin ?? "—"}–{ps.yearMax ?? "—"}
                </td>
                <td className="px-3 py-2">
                  {ps.mileageMin != null ? ps.mileageMin.toLocaleString() : "—"}–
                  {ps.mileageMax != null ? ps.mileageMax.toLocaleString() : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <ul className="grid gap-1 text-sm sm:grid-cols-2" data-testid="price-vs-median">
        <li>
          Purchase price vs comparable asking-price median:{" "}
          <strong>
            {money(report.purchasePriceVsMedian?.dollarDiffFromMedian)} (
            {pct(report.purchasePriceVsMedian?.pctDiffFromMedian)})
          </strong>
        </li>
        <li>
          Landed cost vs comparable asking-price median:{" "}
          <strong>
            {money(report.landedCostVsMedian?.dollarDiffFromMedian)} (
            {pct(report.landedCostVsMedian?.pctDiffFromMedian)})
          </strong>
        </li>
        {lc && (
          <>
            <li>
              Approx. gross-margin opportunity vs asking median (before overhead — not profit):{" "}
              <strong>{money(lc.approximateGrossMarginOpportunity)}</strong>
            </li>
            <li>
              Break-even asking target (landed + desired margin — not a predicted sale price):{" "}
              <strong>{money(lc.breakEvenResalePrice)}</strong>
            </li>
          </>
        )}
      </ul>

      <div className="space-y-3">
        <h4 className="text-sm font-bold uppercase text-neutral-600">Usable comparables</h4>
        <ul className="space-y-3 md:hidden">
          {report.usableComparables.map((c) => (
            <li key={c.canonicalUrl} className="border border-neutral-200 p-3 text-sm">
              <a
                href={c.listing.listingUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[#fc0527] underline"
              >
                {[c.listing.year, c.listing.makeModel].filter(Boolean).join(" ")}
              </a>
              <p className="mt-1 text-neutral-700">
                {c.listing.mileage != null ? `${c.listing.mileage.toLocaleString()} mi` : "— mi"} ·{" "}
                {money(c.listing.askingPrice)}
                {c.listing.boxLengthFt != null ? ` · ${c.listing.boxLengthFt}'` : ""}
              </p>
              <p className="text-neutral-600">{c.listing.location || "Location —"}</p>
              <p className="mt-1 text-xs text-neutral-500">{c.includeReasons.join("; ")}</p>
              {c.differenceNotes.length > 0 && (
                <p className="text-xs text-amber-800">Diffs: {c.differenceNotes.join("; ")}</p>
              )}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-2">Listing</th>
                <th className="px-3 py-2">Miles</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Box</th>
                <th className="px-3 py-2">Specs</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Why included</th>
              </tr>
            </thead>
            <tbody>
              {report.usableComparables.map((c) => (
                <tr key={c.canonicalUrl} className="border-t border-neutral-100 align-top">
                  <td className="px-3 py-2">
                    <a
                      href={c.listing.listingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[#fc0527] underline"
                    >
                      {[c.listing.year, c.listing.makeModel].filter(Boolean).join(" ")}
                    </a>
                    <div className="text-xs text-neutral-500">{c.listing.sourceName}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {c.listing.mileage != null ? c.listing.mileage.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{money(c.listing.askingPrice)}</td>
                  <td className="px-3 py-2">
                    {c.listing.boxLengthFt != null ? `${c.listing.boxLengthFt}'` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {[
                      c.listing.engine || null,
                      c.listing.transmission || null,
                      c.listing.manufacturerGvwrLbs != null
                        ? `GVWR ${c.listing.manufacturerGvwrLbs.toLocaleString()}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2">{c.listing.location || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    <div>{c.includeReasons.join("; ")}</div>
                    {c.differenceNotes.length > 0 && (
                      <div className="text-amber-800">Diffs: {c.differenceNotes.join("; ")}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-neutral-500">
        API: {report.apiUsage.provider}/{report.apiUsage.model} · tool calls{" "}
        {report.apiUsage.webSearchCalls} · tokens{" "}
        {report.apiUsage.inputTokens + report.apiUsage.outputTokens} · est. $
        {report.apiUsage.estimatedCostUsd.toFixed(4)}
      </div>

      {report.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
          {report.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
