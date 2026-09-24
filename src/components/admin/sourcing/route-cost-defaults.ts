/**
 * Pure decisions for when Driving Distance may write Transportation / Inspection.
 * Staff overrides (including explicit $0) always win unless Reset is used.
 */
import type { CostSource } from "@/components/admin/sourcing/DrivingDistanceControls";
import type { RouteCostDefaultsUpdate } from "@/components/admin/sourcing/DrivingDistanceControls";
import { calculateTransportationUsd } from "@/lib/sourcing/distance/google-routes/units";

export type BuildRouteCostDefaultsInput = {
  milesUnrounded: number;
  ratePerMile: number;
  inspectionDefaultUsd: number;
  transportation: number;
  inspection: number;
  transportationSource: CostSource;
  inspectionSource: CostSource;
  /**
   * When true (fresh Calculate success), refresh google_calculated Transportation.
   * Rate/profile changes also refresh google_calculated / profile_default via
   * `refreshDerivedDefaults`.
   */
  mode: "calculate_success" | "cache_or_rate_change" | "seed_inspection_only" | "force_reset_transport";
};

/**
 * Build an atomic cost update.
 * - `staff_override` is never silently replaced (including $0).
 * - Untouched / profile_default / google_calculated fields may be filled or refreshed.
 * - `force_reset_transport` is the only path that replaces a Transportation staff override.
 */
export function buildRouteCostDefaultsUpdate(
  input: BuildRouteCostDefaultsInput
): RouteCostDefaultsUpdate {
  const transportUsd = calculateTransportationUsd(input.milesUnrounded, input.ratePerMile);
  const update: RouteCostDefaultsUpdate = {
    transportationUsd: null,
    inspectionUsd: null,
  };

  if (input.mode === "force_reset_transport") {
    update.transportationUsd = transportUsd;
    update.transportationSource = "google_calculated";
    return update;
  }

  if (input.mode === "seed_inspection_only") {
    if (input.inspectionSource !== "staff_override") {
      update.inspectionUsd = input.inspectionDefaultUsd;
      update.inspectionSource = "profile_default";
    }
    return update;
  }

  // Transportation
  if (input.transportationSource === "staff_override") {
    // Preserve explicit staff value, including $0.
  } else if (
    input.transportationSource === "google_calculated" ||
    input.transportationSource === "profile_default"
  ) {
    // Fill blank profile_default, or refresh google_calculated when rate/cache/calculate changes.
    update.transportationUsd = transportUsd;
    update.transportationSource = "google_calculated";
  }

  // Inspection
  if (input.inspectionSource === "staff_override") {
    // Preserve explicit staff value, including $0.
  } else if (input.inspectionSource === "profile_default") {
    update.inspectionUsd = input.inspectionDefaultUsd;
    update.inspectionSource = "profile_default";
  }

  return update;
}
