"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { calculateDrivingDistanceAction } from "@/app/admin/sourcing/actions";
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

type Props = {
  leadId: string;
  initialCache: DrivingRouteCache | null;
  straightLineMiles: number | null;
  distanceIsEstimate: boolean;
  transportationRatePerMile: number;
  defaultInspectionCost: number;
  transportation: number;
  inspection: number;
  onTransportationChange: (value: number, source: CostSource) => void;
  onInspectionChange: (value: number, source: CostSource) => void;
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
  onTransportationChange,
  onInspectionChange,
  transportationSource,
  inspectionSource,
}: Props) {
  const rate = normalizeTransportationRatePerMile(transportationRatePerMile);
  const inspectionDefault = normalizeDefaultInspectionCost(defaultInspectionCost);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<DrivingRouteCache | null>(initialCache);
  const [displayMiles, setDisplayMiles] = useState<number | null>(
    initialCache ? roundDrivingMilesForDisplay(initialCache.distanceMiles) : null
  );
  const [milesOverride, setMilesOverride] = useState<string>("");
  const submittedRef = useRef(false);

  useEffect(() => {
    setCache(initialCache);
    setDisplayMiles(
      initialCache ? roundDrivingMilesForDisplay(initialCache.distanceMiles) : null
    );
  }, [initialCache]);

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

  function applyCalculatedDefaults(milesUnrounded: number, display: number) {
    const transport = calculateTransportationUsd(milesUnrounded, rate);
    onTransportationChange(transport, "google_calculated");
    onInspectionChange(inspectionDefault, "profile_default");
    setDisplayMiles(display);
    setMilesOverride("");
  }

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
        setStatus(result.message || CITY_CENTER_DRIVING_LABEL);
        applyCalculatedDefaults(result.distanceMilesUnrounded, result.displayMiles);
      } finally {
        submittedRef.current = false;
      }
    });
  }

  function resetTransportation() {
    if (calculatedTransport == null) return;
    onTransportationChange(calculatedTransport, "google_calculated");
  }

  function resetInspection() {
    onInspectionChange(inspectionDefault, "profile_default");
  }

  const formula =
    displayMiles != null && calculatedTransport != null
      ? formatTransportationFormula(
          milesOverride ? Number(milesOverride) || displayMiles : displayMiles,
          rate,
          calculatedTransport
        )
      : null;

  return (
    <div
      className="space-y-3 border border-neutral-200 bg-neutral-50 p-3"
      data-testid="driving-distance-controls"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900">Driving distance (Google Routes)</p>
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
          {status === DRIVING_DISTANCE_CACHED_LABEL ? status : status}
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
                  onTransportationChange(transport, "staff_override");
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
          Straight-line reference (classification only, not used for Transportation): ~
          {Math.round(straightLineMiles)} mi
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 text-xs text-neutral-600">
        <span data-testid="transportation-source">
          Transportation source:{" "}
          {transportationSource === "google_calculated"
            ? "Google-calculated"
            : transportationSource === "profile_default"
              ? "Profile default"
              : "Staff override"}
          {transportation > 0 ? ` ($${transportation.toFixed(2)})` : ""}
        </span>
        <span data-testid="inspection-source">
          Inspection source:{" "}
          {inspectionSource === "profile_default"
            ? "Profile default"
            : inspectionSource === "google_calculated"
              ? "Google-calculated"
              : "Staff override"}
          {inspection > 0 ? ` ($${inspection.toFixed(2)})` : ""}
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
