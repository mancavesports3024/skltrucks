"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { calculateDrivingDistanceAction } from "@/app/admin/sourcing/actions";
import { buildRouteCostDefaultsUpdate } from "@/components/admin/sourcing/route-cost-defaults";
import {
  CITY_CENTER_CONFIRM_NOTICE,
  CITY_CENTER_DRIVING_LABEL,
  DRIVING_DISTANCE_CALCULATING_LABEL,
  DRIVING_DISTANCE_CACHED_LABEL,
  DRIVING_DISTANCE_UNAVAILABLE_MESSAGE,
  type DrivingRouteCache,
} from "@/lib/sourcing/distance/google-routes";
import {
  formatTransportationFormula,
  normalizeDefaultInspectionCost,
  normalizeTransportationRatePerMile,
} from "@/lib/sourcing/market-comparison/cost-defaults";
import {
  calculateTransportationUsd,
  roundDrivingMilesForDisplay,
} from "@/lib/sourcing/distance/google-routes/units";

export type CostSource = "google_calculated" | "profile_default" | "staff_override";

export type RouteCostDefaultsUpdate = {
  /** null = leave Transportation unchanged */
  transportationUsd: number | null;
  /** null = leave Inspection unchanged */
  inspectionUsd: number | null;
  transportationSource?: CostSource;
  inspectionSource?: CostSource;
};

type Props = {
  leadId: string;
  initialCache: DrivingRouteCache | null;
  straightLineMiles: number | null;
  distanceIsEstimate: boolean;
  transportationRatePerMile: number;
  defaultInspectionCost: number;
  transportation: number;
  inspection: number;
  /** Atomic parent update — must apply Transportation + Inspection in one dispatch. */
  onApplyRouteCostDefaults: (update: RouteCostDefaultsUpdate) => void;
  transportationSource: CostSource;
  inspectionSource: CostSource;
};

export default function DrivingDistanceControls({
  leadId,
  initialCache,
  straightLineMiles,
  distanceIsEstimate,
  transportationRatePerMile,
  defaultInspectionCost,
  transportation,
  inspection,
  onApplyRouteCostDefaults,
  transportationSource,
  inspectionSource,
}: Props) {
  const rate = normalizeTransportationRatePerMile(transportationRatePerMile);
  const inspectionDefault = normalizeDefaultInspectionCost(defaultInspectionCost);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(
    initialCache ? DRIVING_DISTANCE_CACHED_LABEL : null
  );
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<DrivingRouteCache | null>(initialCache);
  const [displayMiles, setDisplayMiles] = useState<number | null>(
    initialCache ? roundDrivingMilesForDisplay(initialCache.distanceMiles) : null
  );
  const [milesOverride, setMilesOverride] = useState<string>("");
  const submittedRef = useRef(false);
  const appliedCacheKeyRef = useRef<string | null>(null);
  const onApplyRef = useRef(onApplyRouteCostDefaults);
  onApplyRef.current = onApplyRouteCostDefaults;
  const transportationRef = useRef(transportation);
  const inspectionRef = useRef(inspection);
  const transportationSourceRef = useRef(transportationSource);
  const inspectionSourceRef = useRef(inspectionSource);
  transportationRef.current = transportation;
  inspectionRef.current = inspection;
  transportationSourceRef.current = transportationSource;
  inspectionSourceRef.current = inspectionSource;

  function currentDefaultsInput(
    milesUnrounded: number,
    mode: Parameters<typeof buildRouteCostDefaultsUpdate>[0]["mode"]
  ) {
    return buildRouteCostDefaultsUpdate({
      milesUnrounded,
      ratePerMile: rate,
      inspectionDefaultUsd: inspectionDefault,
      transportation: transportationRef.current,
      inspection: inspectionRef.current,
      transportationSource: transportationSourceRef.current,
      inspectionSource: inspectionSourceRef.current,
      mode,
    });
  }

  // Seed / refresh Inspection from Buying Profile when not a staff override (incl. $0 override).
  useEffect(() => {
    onApplyRef.current(currentDefaultsInput(0, "seed_inspection_only"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionDefault]);

  // Load cached route + refresh google_calculated / profile_default when rate or
  // inspection profile default changes. Zero Google calls.
  useEffect(() => {
    setCache(initialCache);
    setDisplayMiles(
      initialCache ? roundDrivingMilesForDisplay(initialCache.distanceMiles) : null
    );
    if (!initialCache) {
      appliedCacheKeyRef.current = null;
      return;
    }
    const key = `${initialCache.calculatedAt}|${initialCache.distanceMiles}|${initialCache.destLat}|${initialCache.destLng}|${rate}|${inspectionDefault}`;
    if (appliedCacheKeyRef.current === key) return;
    appliedCacheKeyRef.current = key;
    setStatus(DRIVING_DISTANCE_CACHED_LABEL);
    setMilesOverride("");
    onApplyRef.current(currentDefaultsInput(initialCache.distanceMiles, "cache_or_rate_change"));
    // currentDefaultsInput reads latest refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCache, rate, inspectionDefault]);

  const effectiveMilesUnrounded = (() => {
    const raw = milesOverride.trim();
    if (raw) {
      const n = Number(raw.replace(/,/g, ""));
      if (Number.isFinite(n) && n >= 0) return n;
    }
    return cache?.distanceMiles ?? null;
  })();

  const calculatedTransport =
    effectiveMilesUnrounded != null
      ? calculateTransportationUsd(effectiveMilesUnrounded, rate)
      : null;

  function onCalculate() {
    if (pending || submittedRef.current) return;
    submittedRef.current = true;
    setError(null);
    setStatus(DRIVING_DISTANCE_CALCULATING_LABEL);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("leadId", leadId);
        const result = await calculateDrivingDistanceAction(fd);
        if (!result.ok) {
          setError(result.error || DRIVING_DISTANCE_UNAVAILABLE_MESSAGE);
          setStatus(null);
          return;
        }
        setCache(result.cache);
        setDisplayMiles(result.displayMiles);
        setMilesOverride("");
        setStatus(result.message || CITY_CENTER_DRIVING_LABEL);
        appliedCacheKeyRef.current = `${result.cache.calculatedAt}|${result.cache.distanceMiles}|${result.cache.destLat}|${result.cache.destLng}|${rate}|${inspectionDefault}`;
        onApplyRef.current(
          currentDefaultsInput(result.distanceMilesUnrounded, "calculate_success")
        );
      } finally {
        submittedRef.current = false;
      }
    });
  }

  function resetTransportation() {
    if (effectiveMilesUnrounded == null) return;
    // Local only — cached/override miles × current profile rate. Zero provider calls.
    // This is the only action that replaces a Transportation staff override.
    onApplyRef.current(currentDefaultsInput(effectiveMilesUnrounded, "force_reset_transport"));
  }

  function resetInspection() {
    // Only action that replaces an Inspection staff override (including $0).
    onApplyRef.current({
      transportationUsd: null,
      inspectionUsd: inspectionDefault,
      inspectionSource: "profile_default",
    });
  }

  const formula =
    displayMiles != null && calculatedTransport != null
      ? formatTransportationFormula(
          milesOverride ? Number(milesOverride) || displayMiles : displayMiles,
          rate,
          calculatedTransport
        )
      : null;

  const showTransportAmount =
    transportationSource === "staff_override" ||
    transportationSource === "google_calculated" ||
    transportation > 0;
  const showInspectionAmount =
    inspectionSource === "staff_override" ||
    inspectionSource === "google_calculated" ||
    inspection > 0;

  return (
    <div
      className="space-y-3 border border-neutral-200 bg-neutral-50 p-3"
      data-testid="driving-distance-controls"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900">
            Estimated city-center driving distance (Google Routes)
          </p>
          <p className="mt-1 text-xs text-neutral-600">{CITY_CENTER_DRIVING_LABEL}</p>
        </div>
        <button
          type="button"
          onClick={onCalculate}
          disabled={pending}
          aria-busy={pending}
          data-testid="calculate-driving-distance"
          className="min-h-11 bg-neutral-900 px-4 py-2 text-sm font-semibold uppercase text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? DRIVING_DISTANCE_CALCULATING_LABEL : "Calculate driving distance"}
        </button>
      </div>

      {status && (
        <p role="status" aria-live="polite" className="text-sm text-neutral-800">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}

      {displayMiles != null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-semibold text-neutral-800">Driving miles (for cost estimate)</span>
            <input
              type="number"
              min={0}
              step="1"
              value={milesOverride !== "" ? milesOverride : displayMiles}
              onChange={(e) => {
                setMilesOverride(e.target.value);
                const n = Number(String(e.target.value).replace(/,/g, ""));
                if (Number.isFinite(n) && n >= 0) {
                  const transport = calculateTransportationUsd(n, rate);
                  onApplyRef.current({
                    transportationUsd: transport,
                    inspectionUsd: null,
                    transportationSource: "staff_override",
                  });
                }
              }}
              className="mt-1 w-full border border-neutral-300 bg-white px-3 py-2"
              data-testid="driving-miles-override"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Google-calculated display: {displayMiles} mi (city centers)
            </span>
          </label>
          <div className="text-sm text-neutral-700">
            {formula ? (
              <p data-testid="transportation-formula">
                <span className="font-semibold">Formula:</span> {formula}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-neutral-600">{CITY_CENTER_CONFIRM_NOTICE}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-neutral-600">
          No driving-distance estimate yet. Click Calculate — this does not run market search or
          OpenAI/Tavily.
        </p>
      )}

      {straightLineMiles != null && distanceIsEstimate ? (
        <p className="text-xs text-neutral-600" data-testid="straight-line-reference">
          Estimated straight-line distance (classification only — never used for Transportation): ~
          {Math.round(straightLineMiles)} mi
        </p>
      ) : null}

      <p className="text-xs text-neutral-500" data-testid="cost-clear-behavior">
        Clearing Transportation or Inspection (or typing 0) sets an explicit $0 staff override. Use
        Reset to restore the calculated/profile default.
      </p>

      <div className="flex flex-wrap gap-3 text-xs text-neutral-600">
        <span data-testid="transportation-source">
          Transportation source:{" "}
          {transportationSource === "google_calculated"
            ? "Google-calculated"
            : transportationSource === "profile_default"
              ? "Profile default"
              : "Staff override"}
          {showTransportAmount ? ` ($${transportation.toFixed(2)})` : ""}
        </span>
        <span data-testid="inspection-source">
          Inspection source:{" "}
          {inspectionSource === "profile_default"
            ? "Profile default"
            : inspectionSource === "google_calculated"
              ? "Google-calculated"
              : "Staff override"}
          {showInspectionAmount ? ` ($${inspection.toFixed(2)})` : ""}
        </span>
        {calculatedTransport != null && transportationSource === "staff_override" ? (
          <button
            type="button"
            className="underline"
            onClick={resetTransportation}
            data-testid="reset-transportation"
          >
            Reset to calculated default
          </button>
        ) : null}
        {inspectionSource === "staff_override" ? (
          <button
            type="button"
            className="underline"
            onClick={resetInspection}
            data-testid="reset-inspection"
          >
            Reset inspection to profile default
          </button>
        ) : null}
      </div>
    </div>
  );
}
