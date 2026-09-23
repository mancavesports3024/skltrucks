// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarketComparisonPanel from "@/components/admin/sourcing/MarketComparisonPanel";
import {
  MARKET_COMPARISON_DISCLAIMER,
  MARKET_COMPARISON_PENDING_LABEL,
} from "@/lib/sourcing/market-comparison/types";

const useFormStatusMock = vi.fn(() => ({ pending: false, data: null, method: null, action: null }));

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormStatus: () => useFormStatusMock(),
  };
});

afterEach(() => {
  cleanup();
  useFormStatusMock.mockReset();
  useFormStatusMock.mockReturnValue({ pending: false, data: null, method: null, action: null });
});

describe("MarketComparisonPanel", () => {
  it("disables compare and lists missing required fields", () => {
    render(
      <MarketComparisonPanel
        leadId="1"
        eligible={false}
        missingRequired={["Year", "Mileage"]}
        missingPreferred={[]}
        latest={null}
        action={async () => undefined}
      />
    );
    expect(screen.getByText(/Compare market is disabled/i)).toBeInTheDocument();
    expect(screen.getByText("Year")).toBeInTheDocument();
    expect(screen.getByText("Mileage")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Compare market/i })).not.toBeInTheDocument();
    expect(screen.getByText(MARKET_COMPARISON_DISCLAIMER)).toBeInTheDocument();
  });

  it("shows pending label and aria-busy while comparing", () => {
    useFormStatusMock.mockReturnValue({ pending: true, data: null, method: null, action: null });
    render(
      <MarketComparisonPanel
        leadId="1"
        eligible
        missingRequired={[]}
        missingPreferred={[]}
        latest={null}
        action={async () => undefined}
      />
    );
    const btn = screen.getByRole("button", { name: MARKET_COMPARISON_PENDING_LABEL });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent(MARKET_COMPARISON_PENDING_LABEL);
  });
});
