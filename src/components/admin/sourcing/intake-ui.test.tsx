// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IMPORT_IDLE_LABEL,
  IMPORT_PENDING_LABEL,
  IMPORT_PENDING_STATUS,
  IntakeErrorBanner,
  IntakePendingStatus,
  IntakeSubmitButton,
  IntakeSuccessBanner,
  PREVIEW_IDLE_LABEL,
  PREVIEW_PENDING_LABEL,
  PREVIEW_PENDING_STATUS,
} from "@/components/admin/sourcing/IntakePendingControls";
import TruckLeadsList from "@/components/admin/sourcing/TruckLeadsList";
import { formatLeadMileage, formatLeadYear } from "@/lib/sourcing/format-lead-display";
import type { TruckLead } from "@/types/sourcing";

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

describe("formatLeadYear / formatLeadMileage", () => {
  it("formats year and mileage for display", () => {
    expect(formatLeadYear(2019)).toBe("2019");
    expect(formatLeadMileage(136242)).toBe("136,242 mi");
  });

  it("shows em dash when year or mileage is missing", () => {
    expect(formatLeadYear(null)).toBe("—");
    expect(formatLeadYear(undefined)).toBe("—");
    expect(formatLeadMileage(null)).toBe("—");
    expect(formatLeadMileage(undefined)).toBe("—");
  });
});

describe("IntakeSubmitButton pending UI", () => {
  it("shows Preview idle label when not pending", () => {
    useFormStatusMock.mockReturnValue({ pending: false, data: null, method: null, action: null });
    render(
      <form>
        <IntakeSubmitButton kind="preview" />
      </form>
    );
    const btn = screen.getByRole("button", { name: PREVIEW_IDLE_LABEL });
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "false");
  });

  it("shows Previewing workbook… and disables while pending", () => {
    useFormStatusMock.mockReturnValue({ pending: true, data: null, method: null, action: null });
    render(
      <form>
        <IntakeSubmitButton kind="preview" />
        <IntakePendingStatus kind="preview" />
      </form>
    );
    const btn = screen.getByRole("button", { name: PREVIEW_PENDING_LABEL });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent(PREVIEW_PENDING_STATUS);
  });

  it("shows Importing leads… and disables while pending", () => {
    useFormStatusMock.mockReturnValue({ pending: true, data: null, method: null, action: null });
    render(
      <form>
        <IntakeSubmitButton kind="import" />
        <IntakePendingStatus kind="import" />
      </form>
    );
    const btn = screen.getByRole("button", { name: IMPORT_PENDING_LABEL });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent(IMPORT_PENDING_STATUS);
  });

  it("locks submit when another operation is running (duplicate protection)", () => {
    useFormStatusMock.mockReturnValue({ pending: false, data: null, method: null, action: null });
    render(
      <form>
        <IntakeSubmitButton kind="preview" locked />
      </form>
    );
    const btn = screen.getByRole("button", { name: PREVIEW_IDLE_LABEL });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("keeps import idle label when preview form is pending (separate forms)", () => {
    useFormStatusMock.mockReturnValue({ pending: false, data: null, method: null, action: null });
    render(
      <form>
        <IntakeSubmitButton kind="import" locked />
      </form>
    );
    expect(screen.getByRole("button", { name: IMPORT_IDLE_LABEL })).toBeInTheDocument();
    expect(screen.queryByText(PREVIEW_PENDING_LABEL)).not.toBeInTheDocument();
  });
});

describe("Intake success and error banners", () => {
  it("shows assertive error alert", () => {
    render(<IntakeErrorBanner message="Upload failed" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Upload failed");
    expect(alert).toHaveAttribute("aria-live", "assertive");
  });

  it("shows polite success status with totals", () => {
    render(
      <IntakeSuccessBanner>
        <p>Import succeeded.</p>
        <span>3 new</span>
      </IntakeSuccessBanner>
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Import succeeded.");
    expect(status).toHaveTextContent("3 new");
    expect(status).toHaveAttribute("aria-live", "polite");
  });
});

describe("duplicate submission guard via disabled button", () => {
  it("does not fire click handler when disabled/pending", async () => {
    const user = userEvent.setup();
    useFormStatusMock.mockReturnValue({ pending: true, data: null, method: null, action: null });
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    render(
      <form onSubmit={onSubmit as unknown as React.FormEventHandler<HTMLFormElement>}>
        <IntakeSubmitButton kind="preview" />
      </form>
    );
    const btn = screen.getByRole("button", { name: PREVIEW_PENDING_LABEL });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

function sampleLead(partial: Partial<TruckLead> & Pick<TruckLead, "id">): TruckLead {
  return {
    seller: "Test Seller",
    supplierContactId: null,
    sourceUrl: "",
    sourceScope: "test",
    sourceListingId: "u1",
    canonicalListingUrl: "",
    stockNumber: "100",
    vin: "",
    year: 2019,
    makeModel: "Freightliner M2",
    boxLengthFt: 26,
    boxLengthRaw: "26'",
    engine: "Cummins",
    engineIsCummins: true,
    transmission: "Allison",
    transmissionIsAutomatic: true,
    listedWeightLbs: null,
    listedWeightTerm: "unknown",
    manufacturerGvwrLbs: 25500,
    gvwrDoorPlateVerified: false,
    mileage: 136242,
    hasLiftgate: true,
    liftgateNotes: "",
    price: 42000,
    location: "Kansas City, MO",
    drivingDistanceMiles: 142,
    distanceIsEstimate: true,
    dateLastChecked: "2026-09-21",
    verificationNotes: "",
    workflowStatus: "new",
    sklCallNotes: "",
    researchUncertaintyLabels: [],
    isSeedResearch: false,
    seedSource: "",
    matchStatus: "confirmed_match",
    matchReasons: [],
    specEvidence: {},
    ...partial,
  };
}

describe("TruckLeadsList year and mileage", () => {
  beforeEach(() => {
    useFormStatusMock.mockReturnValue({ pending: false, data: null, method: null, action: null });
  });

  it("shows year and comma-formatted mileage on desktop and mobile", () => {
    render(<TruckLeadsList leads={[sampleLead({ id: "1" })]} />);
    expect(screen.getByTestId("truck-leads-desktop")).toHaveTextContent("2019");
    expect(screen.getByTestId("truck-leads-desktop")).toHaveTextContent("136,242 mi");
    expect(screen.getByTestId("truck-leads-mobile")).toHaveTextContent("Year 2019");
    expect(screen.getByTestId("truck-leads-mobile")).toHaveTextContent("136,242 mi");
    expect(screen.getByTestId("truck-leads-mobile")).toHaveTextContent("Freightliner M2");
  });

  it("shows em dash for missing year and mileage", () => {
    render(
      <TruckLeadsList
        leads={[sampleLead({ id: "2", year: null, mileage: null, makeModel: "Unknown unit" })]}
      />
    );
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Year —/)).toBeInTheDocument();
  });

  it("renders listing and inspection links without event handlers (Server Component safe)", () => {
    render(
      <TruckLeadsList
        leads={[
          sampleLead({
            id: "3",
            sourceUrl: "https://example.com/listing/1",
            specEvidence: { inspectionUrl: "https://example.com/inspection/token" },
          }),
        ]}
      />
    );
    const listing = screen.getAllByRole("link", { name: "View listing" });
    const inspection = screen.getAllByRole("link", { name: "View inspection report" });
    expect(listing.length).toBeGreaterThanOrEqual(1);
    expect(inspection.length).toBeGreaterThanOrEqual(1);
    for (const a of [...listing, ...inspection]) {
      expect(a.getAttribute("onclick")).toBeNull();
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
      // Not nested inside another link
      expect(a.closest("a") === a).toBe(true);
    }
  });

  it("omits listing and inspection links when URLs are missing", () => {
    render(
      <TruckLeadsList
        leads={[
          sampleLead({
            id: "4",
            sourceUrl: "",
            canonicalListingUrl: "",
            specEvidence: {},
          }),
        ]}
      />
    );
    expect(screen.queryByRole("link", { name: "View listing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View inspection report" })).not.toBeInTheDocument();
  });
});
