import { describe, expect, it } from "vitest";
import { buildDailyDigestPreview } from "@/lib/sourcing/digest";
import type { TruckLead } from "@/types/sourcing";

function lead(partial: Partial<TruckLead> & Pick<TruckLead, "id" | "matchStatus">): TruckLead {
  return {
    seller: "Test",
    supplierContactId: null,
    sourceUrl: "",
    sourceListingId: "",
    canonicalListingUrl: "",
    stockNumber: "",
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
    manufacturerGvwrLbs: null,
    gvwrDoorPlateVerified: false,
    mileage: 100000,
    hasLiftgate: true,
    liftgateNotes: "",
    price: 40000,
    location: "FL",
    drivingDistanceMiles: 1000,
    distanceIsEstimate: true,
    dateLastChecked: null,
    verificationNotes: "",
    workflowStatus: "new",
    sklCallNotes: "",
    researchUncertaintyLabels: [],
    isSeedResearch: false,
    seedSource: "",
    matchReasons: [],
    ...partial,
  };
}

describe("buildDailyDigestPreview", () => {
  it("groups new/changed leads by match status within 24 hours", () => {
    const now = new Date("2026-09-18T18:00:00Z");
    const digest = buildDailyDigestPreview(
      [
        lead({
          id: "1",
          matchStatus: "needs_verification",
          updatedAt: "2026-09-18T12:00:00Z",
        }),
        lead({
          id: "2",
          matchStatus: "does_not_match",
          updatedAt: "2026-09-18T10:00:00Z",
        }),
        lead({
          id: "3",
          matchStatus: "confirmed_match",
          updatedAt: "2026-09-16T10:00:00Z",
        }),
      ],
      now
    );

    expect(digest.total).toBe(2);
    expect(digest.groups.map((g) => g.status)).toEqual([
      "needs_verification",
      "does_not_match",
    ]);
  });
});
