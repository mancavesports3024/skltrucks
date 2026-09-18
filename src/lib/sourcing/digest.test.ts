import { describe, expect, it } from "vitest";
import { buildDailyDigestPreview } from "@/lib/sourcing/digest";
import {
  listingContentChanged,
  listingContentFingerprint,
  selectDigestLeadEvents,
} from "@/lib/sourcing/listing-content";
import type { TruckLead } from "@/types/sourcing";

function lead(partial: Partial<TruckLead> & Pick<TruckLead, "id" | "matchStatus">): TruckLead {
  return {
    seller: "Test",
    supplierContactId: null,
    sourceUrl: "",
    sourceScope: "test",
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
    specEvidence: { engine: "", transmission: "", boxLength: "", gvwr: "" },
    ...partial,
  };
}

describe("listing content change detection", () => {
  it("ignores staff-only note differences", () => {
    const a = lead({ id: "1", matchStatus: "needs_verification", price: 40000 });
    const b = { ...a, sklCallNotes: "Called seller", verificationNotes: "wait", workflowStatus: "contacted" as const };
    expect(listingContentChanged(a, b)).toBe(false);
    expect(listingContentFingerprint(a)).toBe(listingContentFingerprint(b));
  });

  it("detects price / mileage listing changes", () => {
    const a = lead({ id: "1", matchStatus: "needs_verification", price: 40000 });
    expect(listingContentChanged(a, { ...a, price: 38900 })).toBe(true);
    expect(listingContentChanged(a, { ...a, mileage: 120000 })).toBe(true);
  });
});

describe("buildDailyDigestPreview", () => {
  it("includes newly discovered listings and listing changes, not staff-only updates", () => {
    const now = new Date("2026-09-18T18:00:00Z");
    const digest = buildDailyDigestPreview(
      [
        lead({
          id: "new",
          matchStatus: "needs_verification",
          listingFirstSeenAt: "2026-09-18T12:00:00Z",
          listingLastChangedAt: "2026-09-18T12:00:00Z",
          updatedAt: "2026-09-18T12:00:00Z",
        }),
        lead({
          id: "listing-change",
          matchStatus: "confirmed_match",
          listingFirstSeenAt: "2026-09-01T10:00:00Z",
          listingLastChangedAt: "2026-09-18T11:00:00Z",
          updatedAt: "2026-09-18T11:00:00Z",
          price: 41000,
        }),
        lead({
          id: "staff-only",
          matchStatus: "does_not_match",
          listingFirstSeenAt: "2026-09-01T10:00:00Z",
          listingLastChangedAt: "2026-09-01T10:00:00Z",
          // Staff recorded a call today — updated_at moves, listing stamps do not
          updatedAt: "2026-09-18T16:00:00Z",
          sklCallNotes: "[2026-09-18] Called about GVWR",
        }),
        lead({
          id: "old",
          matchStatus: "confirmed_match",
          listingFirstSeenAt: "2026-09-10T10:00:00Z",
          listingLastChangedAt: "2026-09-10T10:00:00Z",
          updatedAt: "2026-09-10T10:00:00Z",
        }),
      ],
      now
    );

    expect(digest.total).toBe(2);
    expect(digest.newListingCount).toBe(1);
    expect(digest.listingChangeCount).toBe(1);
    expect(digest.seenAgainCount).toBe(0);
    expect(digest.groups.flatMap((g) => g.entries.map((e) => e.lead.id)).sort()).toEqual([
      "listing-change",
      "new",
    ]);
    expect(
      selectDigestLeadEvents(
        [
          lead({
            id: "staff-only",
            matchStatus: "does_not_match",
            listingFirstSeenAt: "2026-09-01T10:00:00Z",
            listingLastChangedAt: "2026-09-01T10:00:00Z",
            listingLastSeenAt: "2026-09-01T10:00:00Z",
            updatedAt: "2026-09-18T16:00:00Z",
          }),
        ],
        new Date("2026-09-17T18:00:00Z"),
        now
      )
    ).toHaveLength(0);
  });

  it("marks unchanged listings re-observed as seen_again", () => {
    const now = new Date("2026-09-18T18:00:00Z");
    const digest = buildDailyDigestPreview(
      [
        lead({
          id: "reseen",
          matchStatus: "needs_verification",
          listingFirstSeenAt: "2026-09-01T10:00:00Z",
          listingLastChangedAt: "2026-09-01T10:00:00Z",
          listingLastSeenAt: "2026-09-18T12:00:00Z",
        }),
      ],
      now
    );
    expect(digest.seenAgainCount).toBe(1);
    expect(digest.groups[0].entries[0].kind).toBe("seen_again");
  });
});
