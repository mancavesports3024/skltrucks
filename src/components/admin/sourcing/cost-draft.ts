/**
 * Pure Market Comparison cost-draft state.
 * Kept outside React so updaters stay free of nested setters / side effects.
 */
import type { CostSource } from "@/components/admin/sourcing/DrivingDistanceControls";
import {
  EMPTY_LANDED_COST_INPUT,
  hasExpenseInputs,
} from "@/lib/sourcing/market-comparison/landed-cost";
import type { LandedCostInput } from "@/lib/sourcing/market-comparison/types";

export type CostDraft = LandedCostInput;

export type CostDraftState = {
  costs: CostDraft;
  transportationSource: CostSource;
  inspectionSource: CostSource;
  /**
   * Monotonic identity of the last justCompleted report we adopted.
   * Prevents re-applying the same completed payload on Strict Mode remounts
   * when the object reference is stable, and skips wipe from zero-cost reports.
   */
  adoptedJustCompletedAt: string | null;
};

export type CostDraftAction =
  | {
      type: "patch";
      patch: Partial<CostDraft>;
      sources?: Partial<{ transportation: CostSource; inspection: CostSource }>;
    }
  | {
      type: "staff_field";
      field: keyof CostDraft;
      value: number;
    }
  | {
      type: "adopt_just_completed";
      comparedAt: string;
      inputs: LandedCostInput;
    }
  | {
      type: "seed_from_latest";
      inputs: LandedCostInput;
    };

export function initialCostDraftState(
  latestInputs: LandedCostInput | null | undefined
): CostDraftState {
  if (latestInputs && hasExpenseInputs(latestInputs)) {
    return {
      costs: { ...EMPTY_LANDED_COST_INPUT, ...latestInputs },
      // Saved report expenses are treated as staff-entered for override purposes
      // when they carry a positive amount; zeros stay profile_default until touched.
      transportationSource:
        latestInputs.transportation > 0 ? "staff_override" : "profile_default",
      inspectionSource: latestInputs.inspection > 0 ? "staff_override" : "profile_default",
      adoptedJustCompletedAt: null,
    };
  }
  return {
    costs: { ...EMPTY_LANDED_COST_INPUT },
    transportationSource: "profile_default",
    inspectionSource: "profile_default",
    adoptedJustCompletedAt: null,
  };
}

/**
 * Clearing a cost input (empty string) or typing `0` sets an explicit $0
 * staff override. That is distinct from an untouched profile_default zero
 * and is never auto-replaced except via Reset.
 */
export function parseStaffCostInput(raw: string): number {
  const trimmed = String(raw).trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function costDraftReducer(
  state: CostDraftState,
  action: CostDraftAction
): CostDraftState {
  switch (action.type) {
    case "patch": {
      const costs: CostDraft = { ...state.costs, ...action.patch };
      return {
        ...state,
        costs,
        transportationSource:
          action.sources?.transportation ?? state.transportationSource,
        inspectionSource: action.sources?.inspection ?? state.inspectionSource,
      };
    }
    case "staff_field": {
      const costs: CostDraft = {
        ...state.costs,
        [action.field]: action.value,
      };
      return {
        ...state,
        costs,
        transportationSource:
          action.field === "transportation"
            ? "staff_override"
            : state.transportationSource,
        inspectionSource:
          action.field === "inspection" ? "staff_override" : state.inspectionSource,
      };
    }
    case "seed_from_latest": {
      // One-shot constructor path only — reducer keeps this for tests/symmetry.
      return initialCostDraftState(action.inputs);
    }
    case "adopt_just_completed": {
      if (state.adoptedJustCompletedAt === action.comparedAt) return state;
      const inputs = action.inputs;
      // Never wipe local google/profile/staff values with a completed report's
      // zero cost inputs. Positive submitted amounts win (form POST).
      const transportation =
        inputs.transportation > 0
          ? inputs.transportation
          : state.costs.transportation;
      const inspection =
        inputs.inspection > 0 ? inputs.inspection : state.costs.inspection;
      return {
        costs: {
          ...EMPTY_LANDED_COST_INPUT,
          ...inputs,
          transportation,
          inspection,
        },
        transportationSource:
          inputs.transportation > 0
            ? "staff_override"
            : state.transportationSource,
        inspectionSource:
          inputs.inspection > 0 ? "staff_override" : state.inspectionSource,
        adoptedJustCompletedAt: action.comparedAt,
      };
    }
    default:
      return state;
  }
}

/** Display helper: untouched profile_default zeros stay visually empty. */
export function costInputDisplayValue(
  field: "transportation" | "inspection",
  value: number,
  source: CostSource
): number | "" {
  if (source === "staff_override" || source === "google_calculated") return value;
  if (value > 0) return value;
  return "";
}
