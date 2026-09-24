// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketComparisonPanel from "@/components/admin/sourcing/MarketComparisonPanel";
import { buildDrivingRouteCache } from "@/lib/sourcing/distance/google-routes/cache";
import { METERS_PER_MILE } from "@/lib/sourcing/distance/google-routes/units";
import {
  calculateDrivingDistanceAction,
  compareMarketAction,
} from "@/app/admin/sourcing/actions";

const useFormStatusMock = vi.fn(() => ({ pending: false, data: null, method: null, action: null }));

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormStatus: () => useFormStatusMock(),
  };
});

vi.mock("@/app/admin/sourcing/actions", () => ({
  calculateDrivingDistanceAction: vi.fn(),
  compareMarketAction: vi.fn(),
}));

const calculateMock = vi.mocked(calculateDrivingDistanceAction);
const compareMock = vi.mocked(compareMarketAction);

function transportInput(): HTMLInputElement {
  const label = screen.getByText(/^Transportation \(optional\)$/i).closest("label");
  expect(label).toBeTruthy();
  return within(label as HTMLElement).getByRole("spinbutton") as HTMLInputElement;
}

function inspectionInput(): HTMLInputElement {
  const label = screen.getByText(/^Inspection \(optional\)$/i).closest("label");
  expect(label).toBeTruthy();
  return within(label as HTMLElement).getByRole("spinbutton") as HTMLInputElement;
}

function mockRouteCache(milesUnrounded: number) {
  return buildDrivingRouteCache({
    distanceMeters: milesUnrounded * METERS_PER_MILE,
    durationSeconds: 7200,
    destLat: 39.0997,
    destLng: -94.5786,
    calculatedAt: "2026-01-15T12:00:00.000Z",
  });
}

async function buildSampleReport() {
  const { buildMarketComparisonReport } = await import(
    "@/lib/sourcing/market-comparison/build-report"
  );
  const { mockComparableListings, mockMarketComparisonUsage } = await import(
    "@/lib/sourcing/market-comparison/mock"
  );
  const lead = {
    id: "lead-1",
    year: 2019,
    makeModel: "Freightliner M2",
    mileage: 140000,
    price: 40000,
    boxLengthFt: 26,
    engine: "Cummins",
    engineIsCummins: true,
    transmission: "Auto",
    transmissionIsAutomatic: true,
    manufacturerGvwrLbs: 25500,
    listedWeightLbs: null,
    hasLiftgate: true,
    location: "Kansas City, MO",
  };
  return buildMarketComparisonReport({
    lead,
    listings: mockComparableListings(lead),
    apiUsage: mockMarketComparisonUsage(),
    provider: "mock",
  });
}

const baseDistanceProps = {
  straightLineMiles: 140,
  distanceIsEstimate: true,
  transportationRatePerMile: 2.25,
  defaultInspectionCost: 230,
} as const;

afterEach(() => {
  cleanup();
  useFormStatusMock.mockReset();
  useFormStatusMock.mockReturnValue({ pending: false, data: null, method: null, action: null });
  calculateMock.mockReset();
  compareMock.mockReset();
});

beforeEach(() => {
  calculateMock.mockResolvedValue({
    ok: false,
    error: "not configured",
  } as never);
});

describe("Market Comparison Transportation autopopulate", () => {
  it("successful Google result populates Transportation (160 × $2.25 = $360.00)", async () => {
    const cache = mockRouteCache(160);
    calculateMock.mockResolvedValue({
      ok: true,
      error: null,
      message: null,
      displayMiles: 160,
      distanceMilesUnrounded: 160,
      durationSeconds: 7200,
      transportationDefaultUsd: 360,
      inspectionDefaultUsd: 230,
      ratePerMile: 2.25,
      formula: "160 mi × $2.25/mi = $360.00",
      methodLabel: "Estimated driving distance between city centers",
      confirmNotice: "confirm",
      usage: {
        provider: "google_routes",
        cached: false,
        requestCount: 1,
        success: true,
        failureCategory: null,
        calculatedAt: cache.calculatedAt,
      },
      cache,
      straightLineMiles: 140,
    } as never);

    render(
      <MarketComparisonPanel
        leadId="lead-1"
        eligible
        missingRequired={[]}
        missingPreferred={[]}
        latest={null}
        action={async () => undefined}
        drivingRouteCache={null}
        {...baseDistanceProps}
      />
    );

    fireEvent.click(screen.getByTestId("calculate-driving-distance"));

    await waitFor(() => {
      expect(transportInput().value).toBe("360");
    });
    expect(screen.getByTestId("transportation-formula")).toHaveTextContent(
      "160 mi × $2.25/mi = $360.00"
    );
    expect(screen.getByTestId("transportation-source")).toHaveTextContent(/Google-calculated/);
    expect(screen.getByTestId("transportation-source")).toHaveTextContent("$360.00");
    expect(calculateMock).toHaveBeenCalledTimes(1);
  });

  it("decimal mileage rounds only the final currency amount", async () => {
    // 160.4 × 2.25 = 360.9 → $360.90 (round currency only; display miles = 160)
    const unrounded = 160.4;
    const cache = mockRouteCache(unrounded);
    calculateMock.mockResolvedValue({
      ok: true,
      error: null,
      message: null,
      displayMiles: 160,
      distanceMilesUnrounded: unrounded,
      durationSeconds: 7200,
      transportationDefaultUsd: 360.9,
      inspectionDefaultUsd: 230,
      ratePerMile: 2.25,
      formula: "160 mi × $2.25/mi = $360.90",
      methodLabel: "label",
      confirmNotice: "confirm",
      usage: {
        provider: "google_routes",
        cached: false,
        requestCount: 1,
        success: true,
        failureCategory: null,
        calculatedAt: cache.calculatedAt,
      },
      cache,
      straightLineMiles: 140,
    } as never);

    render(
      <MarketComparisonPanel
        leadId="lead-1"
        eligible
        missingRequired={[]}
        missingPreferred={[]}
        latest={null}
        action={async () => undefined}
        drivingRouteCache={null}
        {...baseDistanceProps}
      />
    );

    fireEvent.click(screen.getByTestId("calculate-driving-distance"));
    await waitFor(() => {
      expect(transportInput().value).toBe("360.9");
    });
    expect(screen.getByTestId("transportation-formula")).toHaveTextContent(
      "160 mi × $2.25/mi = $360.90"
    );
  });

  it("uses a custom saved Buying Profile rate (not hardcoded 2.25)", async () => {
    const cache = mockRouteCache(100);
    calculateMock.mockResolvedValue({
      ok: true,
      error: null,
      message: null,
      displayMiles: 100,
      distanceMilesUnrounded: 100,
      durationSeconds: 3600,
      transportationDefaultUsd: 300,
      inspectionDefaultUsd: 230,
      ratePerMile: 3,
      formula: "100 mi × $3.00/mi = $300.00",
      methodLabel: "label",
      confirmNotice: "confirm",
      usage: {
        provider: "google_routes",
        cached: false,
        requestCount: 1,
        success: true,
        failureCategory: null,
        calculatedAt: cache.calculatedAt,
      },
      cache,
      straightLineMiles: 90,
    } as never);

    render(
      <MarketComparisonPanel
        leadId="lead-1"
        eligible
        missingRequired={[]}
        missingPreferred={[]}
        latest={null}
        action={async () => undefined}
        drivingRouteCache={null}
        {...baseDistanceProps}
        transportationRatePerMile={3}
      />
    );

    fireEvent.click(screen.getByTestId("calculate-driving-distance"));
    await waitFor(() => {
      expect(transportInput().value).toBe("300");
    });
    expect(screen.getByTestId("transportation-formula")).toHaveTextContent(
      "100 mi × $3.00/mi = $300.00"
    );
  });

  it("cached route populates Transportation with zero Google calls", async () => {
    const cache = mockRouteCache(160);
    render(
      <MarketComparisonPanel
        leadId="lead-1"
        eligible
        missingRequired={[]}
        missingPreferred={[]}
        latest={null}
        action={async () => undefined}
        drivingRouteCache={cache}
        {...baseDistanceProps}
      />
    );

    await waitFor(() => {
      expect(transportInput().value).toBe("360");
    });
    expect(calculateMock).not.toHaveBeenCalled();
    expect(compareMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("transportation-formula")).toHaveTextContent(
      "160 mi × $2.25/mi = $360.00"
    );
    expect(screen.getByRole("status")).toHaveTextContent(/saved driving-distance/i);
  });

  it("blank Transportation is automatically populated; Inspection defaults to $230", async () => {
    const cache = mockRouteCache(160);
    render(
      <MarketComparisonPanel
        leadId="lead-1"
        eligible
        missingRequired={[]}
        missingPreferred={[]}
        latest={null}
        action={async () => undefined}
        drivingRouteCache={cache}
        {...baseDistanceProps}
      />
    );

    await waitFor(() => {
      expect(transportInput().value).toBe("360");
      expect(inspectionInput().value).toBe("230");
    });
    expect(screen.getByTestId("inspection-source")).toHaveTextContent(/Profile default/);
    expect(screen.getByTestId("inspection-source")).toHaveTextContent("$230.00");
  });

  it("manual Transportation override is preserved across Calculate", async () => {
    const cache = mockRouteCache(160);
    calculateMock.mockResolvedValue({
      ok: true,
      error: null,
      message: null,
      displayMiles: 160,
      distanceMilesUnrounded: 160,
      durationSeconds: 7200,
      transportationDefaultUsd: 360,
      inspectionDefaultUsd: 230,
      ratePerMile: 2.25,
      formula: "160 mi × $2.25/mi = $360.00",
      methodLabel: "label",
      confirmNotice: "confirm",
      usage: {
        provider: "google_routes",
        cached: false,
        requestCount: 1,
        success: true,
        failureCategory: null,
        calculatedAt: cache.calculatedAt,
      },
      cache,
      straightLineMiles: 140,
    } as never);

    render(
      <MarketComparisonPanel
        leadId="lead-1"
        eligible
        missingRequired={[]}
        missingPreferred={[]}
        latest={null}
        action={async () => undefined}
        drivingRouteCache={null}
        {...baseDistanceProps}
      />
    );

    // Staff types a manual Transportation amount before Calculate.
    fireEvent.change(transportInput(), { target: { value: "500" } });
    expect(transportInput().value).toBe("500");
    expect(screen.getByTestId("transportation-source")).toHaveTextContent(/Staff override/);

    fireEvent.click(screen.getByTestId("calculate-driving-distance"));
    await waitFor(() => {
      expect(screen.getByTestId("transportation-formula")).toHaveTextContent(/160 mi/);
    });
    // Manual override preserved — not silently overwritten to 360.
    expect(transportInput().value).toBe("500");
    expect(screen.getByTestId("reset-transportation")).toBeInTheDocument();
  });

  it("Reset to calculated default restores miles × rate locally (no provider calls)", async () => {
    const cache = mockRouteCache(160);
    render(
      <MarketComparisonPanel
        leadId="lead-1"
        eligible
        missingRequired={[]}
        missingPreferred={[]}
        latest={null}
        action={async () => undefined}
        drivingRouteCache={cache}
        {...baseDistanceProps}
      />
    );

    await waitFor(() => expect(transportInput().value).toBe("360"));
    calculateMock.mockClear();

    fireEvent.change(transportInput(), { target: { value: "999" } });
    expect(transportInput().value).toBe("999");
    fireEvent.click(screen.getByTestId("reset-transportation"));
    await waitFor(() => expect(transportInput().value).toBe("360"));
    expect(screen.getByTestId("transportation-source")).toHaveTextContent(/Google-calculated/);
    expect(calculateMock).not.toHaveBeenCalled();
    expect(compareMock).not.toHaveBeenCalled();
  });

  it("landed cost updates when Transportation is populated; cost edits do not call providers", async () => {
    const report = await buildSampleReport();
    const cache = mockRouteCache(160);

    render(
      <MarketComparisonPanel
        leadId="lead-1"
        eligible
        missingRequired={[]}
        missingPreferred={[]}
        latest={null}
        justCompleted={report}
        action={async () => undefined}
        drivingRouteCache={cache}
        {...baseDistanceProps}
      />
    );

    await waitFor(() => expect(transportInput().value).toBe("360"));
    await waitFor(() => expect(inspectionInput().value).toBe("230"));

    // Landed cost should reflect truck price + transport + inspection.
    // money() in the panel rounds to whole dollars for display.
    await waitFor(() => {
      const reportNode = screen.getByTestId("market-comparison-report");
      expect(reportNode).toHaveTextContent(/Est\. landed cost:/i);
      // 40000 + 360 + 230 = 40590
      expect(reportNode).toHaveTextContent("$40,590");
    });
    expect(reportNodeHasExpensesIncluded()).toBe(true);

    calculateMock.mockClear();
    compareMock.mockClear();
    fireEvent.change(transportInput(), { target: { value: "400" } });
    await waitFor(() => {
      expect(screen.getByTestId("market-comparison-report")).toHaveTextContent("$40,630");
    });
    expect(calculateMock).not.toHaveBeenCalled();
    expect(compareMock).not.toHaveBeenCalled();
  });

  it("does not overwrite a staff-modified Inspection value", async () => {
    const cache = mockRouteCache(160);
    calculateMock.mockResolvedValue({
      ok: true,
      error: null,
      message: null,
      displayMiles: 160,
      distanceMilesUnrounded: 160,
      durationSeconds: 7200,
      transportationDefaultUsd: 360,
      inspectionDefaultUsd: 230,
      ratePerMile: 2.25,
      formula: "160 mi × $2.25/mi = $360.00",
      methodLabel: "label",
      confirmNotice: "confirm",
      usage: {
        provider: "google_routes",
        cached: false,
        requestCount: 1,
        success: true,
        failureCategory: null,
        calculatedAt: cache.calculatedAt,
      },
      cache,
      straightLineMiles: 140,
    } as never);

    render(
      <MarketComparisonPanel
        leadId="lead-1"
        eligible
        missingRequired={[]}
        missingPreferred={[]}
        latest={null}
        action={async () => undefined}
        drivingRouteCache={null}
        {...baseDistanceProps}
      />
    );

    await waitFor(() => expect(inspectionInput().value).toBe("230"));
    fireEvent.change(inspectionInput(), { target: { value: "275" } });
    expect(inspectionInput().value).toBe("275");

    fireEvent.click(screen.getByTestId("calculate-driving-distance"));
    await waitFor(() => expect(transportInput().value).toBe("360"));
    expect(inspectionInput().value).toBe("275");
  });

  it("existing route cache object is unchanged by cost population", async () => {
    const cache = mockRouteCache(160);
    const before = JSON.stringify(cache);
    render(
      <MarketComparisonPanel
        leadId="lead-1"
        eligible
        missingRequired={[]}
        missingPreferred={[]}
        latest={null}
        action={async () => undefined}
        drivingRouteCache={cache}
        {...baseDistanceProps}
      />
    );
    await waitFor(() => expect(transportInput().value).toBe("360"));
    expect(JSON.stringify(cache)).toBe(before);
    expect(cache.distanceMiles).toBeCloseTo(160, 10);
    expect(cache.provider).toBe("google_routes");
  });
});

function reportNodeHasExpensesIncluded(): boolean {
  const node = screen.getByTestId("market-comparison-report");
  return /expenses included in final assessment/i.test(node.textContent || "");
}

describe("MarketComparisonPanel (existing)", () => {
  it("disables compare and lists missing required fields", () => {
    render(
      <MarketComparisonPanel
        leadId="1"
        eligible={false}
        missingRequired={["Year", "Mileage"]}
        missingPreferred={[]}
        latest={null}
        action={async () => undefined}
        drivingRouteCache={null}
        {...baseDistanceProps}
      />
    );
    expect(screen.getByText(/Compare market is disabled/i)).toBeInTheDocument();
    expect(screen.getByTestId("calculate-driving-distance")).toBeInTheDocument();
  });
});
