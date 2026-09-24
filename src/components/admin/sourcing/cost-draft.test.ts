import { describe, expect, it } from "vitest";
import {
  costDraftReducer,
  costInputDisplayValue,
  initialCostDraftState,
  parseStaffCostInput,
} from "@/components/admin/sourcing/cost-draft";
import { buildRouteCostDefaultsUpdate } from "@/components/admin/sourcing/route-cost-defaults";
import { EMPTY_LANDED_COST_INPUT } from "@/lib/sourcing/market-comparison/landed-cost";

describe("costDraftReducer (pure, no nested setters)", () => {
  it("patches transportation and inspection atomically with sources", () => {
    const state = initialCostDraftState(null);
    const next = costDraftReducer(state, {
      type: "patch",
      patch: { transportation: 360, inspection: 230 },
      sources: {
        transportation: "google_calculated",
        inspection: "profile_default",
      },
    });
    expect(next.costs.transportation).toBe(360);
    expect(next.costs.inspection).toBe(230);
    expect(next.transportationSource).toBe("google_calculated");
    expect(next.inspectionSource).toBe("profile_default");
    // Reducer returns a new object — no React setters involved.
    expect(next).not.toBe(state);
  });

  it("staff_field marks override including explicit zero", () => {
    let state = initialCostDraftState(null);
    state = costDraftReducer(state, { type: "staff_field", field: "transportation", value: 0 });
    expect(state.costs.transportation).toBe(0);
    expect(state.transportationSource).toBe("staff_override");
    expect(costInputDisplayValue("transportation", 0, "staff_override")).toBe(0);
  });

  it("parseStaffCostInput: empty clear and 0 are explicit zeros", () => {
    expect(parseStaffCostInput("")).toBe(0);
    expect(parseStaffCostInput("0")).toBe(0);
    expect(parseStaffCostInput("360.00")).toBe(360);
  });

  it("adopt_just_completed does not wipe local values with zero report inputs", () => {
    let state = costDraftReducer(initialCostDraftState(null), {
      type: "patch",
      patch: { transportation: 360, inspection: 230 },
      sources: {
        transportation: "google_calculated",
        inspection: "profile_default",
      },
    });
    state = costDraftReducer(state, {
      type: "adopt_just_completed",
      comparedAt: "2026-01-01T00:00:00.000Z",
      inputs: { ...EMPTY_LANDED_COST_INPUT },
    });
    expect(state.costs.transportation).toBe(360);
    expect(state.costs.inspection).toBe(230);
    expect(state.transportationSource).toBe("google_calculated");
  });

  it("adopt_just_completed positive form values win once", () => {
    let state = costDraftReducer(initialCostDraftState(null), {
      type: "patch",
      patch: { transportation: 360 },
      sources: { transportation: "google_calculated" },
    });
    state = costDraftReducer(state, {
      type: "adopt_just_completed",
      comparedAt: "t1",
      inputs: { ...EMPTY_LANDED_COST_INPUT, transportation: 400, inspection: 250 },
    });
    expect(state.costs.transportation).toBe(400);
    expect(state.costs.inspection).toBe(250);
    expect(state.transportationSource).toBe("staff_override");
    // Same comparedAt is a no-op (Strict Mode safe).
    const again = costDraftReducer(state, {
      type: "adopt_just_completed",
      comparedAt: "t1",
      inputs: { ...EMPTY_LANDED_COST_INPUT },
    });
    expect(again).toBe(state);
  });

  it("seeds from latest report with expenses", () => {
    const state = initialCostDraftState({
      ...EMPTY_LANDED_COST_INPUT,
      transportation: 360,
      inspection: 230,
    });
    expect(state.costs.transportation).toBe(360);
    expect(state.transportationSource).toBe("staff_override");
  });
});

describe("buildRouteCostDefaultsUpdate", () => {
  it("staff_override zero survives calculate/cache updates", () => {
    const calc = buildRouteCostDefaultsUpdate({
      milesUnrounded: 160,
      ratePerMile: 2.25,
      inspectionDefaultUsd: 230,
      transportation: 0,
      inspection: 0,
      transportationSource: "staff_override",
      inspectionSource: "staff_override",
      mode: "calculate_success",
    });
    expect(calc.transportationUsd).toBeNull();
    expect(calc.inspectionUsd).toBeNull();
  });

  it("force_reset_transport replaces staff override", () => {
    const reset = buildRouteCostDefaultsUpdate({
      milesUnrounded: 160,
      ratePerMile: 2.25,
      inspectionDefaultUsd: 230,
      transportation: 0,
      inspection: 0,
      transportationSource: "staff_override",
      inspectionSource: "staff_override",
      mode: "force_reset_transport",
    });
    expect(reset.transportationUsd).toBe(360);
    expect(reset.transportationSource).toBe("google_calculated");
  });

  it("rate change refreshes google_calculated to new amount", () => {
    const at225 = buildRouteCostDefaultsUpdate({
      milesUnrounded: 160,
      ratePerMile: 2.25,
      inspectionDefaultUsd: 230,
      transportation: 360,
      inspection: 230,
      transportationSource: "google_calculated",
      inspectionSource: "profile_default",
      mode: "cache_or_rate_change",
    });
    expect(at225.transportationUsd).toBe(360);

    const at300 = buildRouteCostDefaultsUpdate({
      milesUnrounded: 160,
      ratePerMile: 3,
      inspectionDefaultUsd: 230,
      transportation: 360,
      inspection: 230,
      transportationSource: "google_calculated",
      inspectionSource: "profile_default",
      mode: "cache_or_rate_change",
    });
    expect(at300.transportationUsd).toBe(480);
    expect(at300.transportationSource).toBe("google_calculated");
  });

  it("changed inspection profile default updates only profile_default", () => {
    const profile = buildRouteCostDefaultsUpdate({
      milesUnrounded: 160,
      ratePerMile: 2.25,
      inspectionDefaultUsd: 275,
      transportation: 360,
      inspection: 230,
      transportationSource: "google_calculated",
      inspectionSource: "profile_default",
      mode: "cache_or_rate_change",
    });
    expect(profile.inspectionUsd).toBe(275);

    const staff = buildRouteCostDefaultsUpdate({
      milesUnrounded: 160,
      ratePerMile: 2.25,
      inspectionDefaultUsd: 275,
      transportation: 360,
      inspection: 0,
      transportationSource: "google_calculated",
      inspectionSource: "staff_override",
      mode: "cache_or_rate_change",
    });
    expect(staff.inspectionUsd).toBeNull();
  });
});
