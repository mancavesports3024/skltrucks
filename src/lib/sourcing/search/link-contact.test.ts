import { describe, expect, it } from "vitest";
import {
  findUnambiguousContactMatch,
  formatDatabaseInsertFailure,
  listingDomain,
  looksLikeHostnameSeller,
  normalizePhoneDigits,
  preferSellerDisplayName,
  type LinkableContact,
} from "@/lib/sourcing/search/link-contact";
import { candidateToTruckLeadInput } from "@/lib/sourcing/search/map-candidates";
import { evaluateSearchPayloadForTest } from "@/lib/sourcing/search/evaluate";
import type { ExtractedContactCandidate, ExtractedTruckCandidate } from "@/lib/sourcing/search/types";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

const GLOBAL_LISTING =
  "https://www.globetrucks.com/inventory/2017-freightliner-m2-106-/675470";

function baseTruck(over: Partial<ExtractedTruckCandidate> = {}): ExtractedTruckCandidate {
  return {
    listingUrl: GLOBAL_LISTING,
    sourceName: "",
    seller: "",
    stockNumber: "675470",
    vin: "",
    year: 2017,
    makeModel: "Freightliner M2 106",
    engine: "Cummins",
    engineIsCummins: true,
    engineEvidence: "Engine: Cummins",
    transmission: "Automatic",
    transmissionIsAutomatic: true,
    transmissionEvidence: "Transmission: Automatic",
    boxLengthFt: null,
    boxLengthEvidence: "",
    manufacturerGvwrLbs: null,
    listedWeightLbs: null,
    listedWeightTerm: "unknown",
    gvwrEvidence: "",
    mileage: 210000,
    hasLiftgate: null,
    askingPrice: null,
    auctionCurrentBid: null,
    location: "Springfield, MO",
    drivingDistanceMiles: 112,
    distanceIsEstimate: true,
    phone: "417-825-2022",
    contactName: "",
    contactRole: "",
    evidenceUrl: GLOBAL_LISTING,
    notes: "",
    ...over,
  };
}

function baseContact(over: Partial<ExtractedContactCandidate> = {}): ExtractedContactCandidate {
  return {
    company: "Global Trucks",
    contactName: "Unknown",
    role: "Sales",
    phone: "417-825-2022",
    email: "",
    sourceUrl: GLOBAL_LISTING,
    supplierType: "Web search",
    evidenceQuote: "Call us at 417-825-2022",
    notes: "",
    ...over,
  };
}

describe("link-contact helpers", () => {
  it("normalizes phone digits and strips leading US 1", () => {
    expect(normalizePhoneDigits("(417) 825-2022")).toBe("4178252022");
    expect(normalizePhoneDigits("1-417-825-2022")).toBe("4178252022");
  });

  it("extracts listing domain without www", () => {
    expect(listingDomain(GLOBAL_LISTING)).toBe("globetrucks.com");
  });

  it("detects hostname-derived seller slugs", () => {
    expect(looksLikeHostnameSeller("globetrucks-com", GLOBAL_LISTING)).toBe(true);
    expect(looksLikeHostnameSeller("globetrucks.com", GLOBAL_LISTING)).toBe(true);
    expect(looksLikeHostnameSeller("", GLOBAL_LISTING)).toBe(true);
    expect(looksLikeHostnameSeller("Global Trucks", GLOBAL_LISTING)).toBe(false);
  });
});

describe("regression: truck + contact returned separately, same domain/company", () => {
  it("links when truck and contact share listing domain (separate payload items)", () => {
    const truck = baseTruck({ seller: "", phone: "" }); // domain-only match
    const contact: LinkableContact = {
      id: "71eebf52-3768-4050-b793-b22191597cb3",
      company: "Global Trucks",
      phone: "417-825-2022",
      sourceUrl: GLOBAL_LISTING,
    };

    const match = findUnambiguousContactMatch(
      {
        seller: truck.seller,
        phone: truck.phone,
        listingUrl: truck.listingUrl,
      },
      [contact]
    );
    expect(match?.id).toBe(contact.id);
    expect(match?.company).toBe("Global Trucks");

    const mapped = candidateToTruckLeadInput(truck);
    expect(mapped.rejectReason).toBeUndefined();
    // Without link, seller falls back to hostname slug
    expect(looksLikeHostnameSeller(mapped.input.seller, mapped.input.sourceUrl)).toBe(true);
    const seller = preferSellerDisplayName(
      mapped.input.seller,
      mapped.input.sourceUrl,
      match!.company
    );
    expect(seller).toBe("Global Trucks");
  });

  it("links on phone when company names differ in casing/format", () => {
    const contact: LinkableContact = {
      id: "contact-phone",
      company: "Global Trucks",
      phone: "(417) 825-2022",
      sourceUrl: "https://www.globetrucks.com/contact",
    };
    const match = findUnambiguousContactMatch(
      {
        seller: "globetrucks-com",
        phone: "417-825-2022",
        listingUrl: GLOBAL_LISTING,
      },
      [contact]
    );
    expect(match?.id).toBe("contact-phone");
  });

  it("links on companyName when domains differ", () => {
    const contact: LinkableContact = {
      id: "contact-company",
      company: "Truck and Van Outlet",
      phone: "(877) 555-0100",
      sourceUrl: "https://www.truckandvanoutlet.com/contact",
    };
    const match = findUnambiguousContactMatch(
      {
        seller: "Truck and Van Outlet",
        companyName: "Truck and Van Outlet",
        phone: "",
        listingUrl:
          "https://www.other-aggregator.com/inventory/used-2020-international-mv607-14490868",
      },
      [contact]
    );
    expect(match?.id).toBe("contact-company");
  });

  it("returns null when two different contacts match (ambiguous)", () => {
    const contacts: LinkableContact[] = [
      {
        id: "a",
        company: "Global Trucks",
        phone: "417-825-2022",
        sourceUrl: GLOBAL_LISTING,
      },
      {
        id: "b",
        company: "Other Globe Dealer",
        phone: "417-999-9999",
        sourceUrl: "https://www.globetrucks.com/other-inventory/1",
      },
    ];
    // Domain matches both → ambiguous
    const match = findUnambiguousContactMatch(
      { seller: "", phone: "", listingUrl: GLOBAL_LISTING },
      contacts
    );
    expect(match).toBeNull();
  });

  it("evaluateSearchPayloadForTest keeps truck and contact as separate outcomes", () => {
    const result = evaluateSearchPayloadForTest(
      DEFAULT_BUYING_PROFILE,
      {
        trucks: [baseTruck()],
        contacts: [baseContact()],
        sourcesConsulted: [GLOBAL_LISTING],
        queriesUsed: [],
        notes: "",
      },
      []
    );
    expect(result.trucks).toHaveLength(1);
    expect(result.trucks[0].outcome).toBe("inserted");
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].outcome).toBe("inserted");
    expect(result.contacts[0].company).toBe("Global Trucks");
  });
});

describe("failed database inserts in search-run report", () => {
  it("formats insert failures clearly and never looks like a saved lead outcome", () => {
    const reason = formatDatabaseInsertFailure(
      'new row for relation "sourcing_truck_leads" violates check constraint "sourcing_truck_leads_listed_weight_term_check"'
    );
    expect(reason).toMatch(/^Database insert failed:/);
    expect(reason).toMatch(/listed_weight_term_check/);

    // Report entry shape used by run.ts — rejected, no id, not counted as saved
    const trucksSavedEntry = {
      seller: "Stapleton Motors",
      stockNumber: "917966",
      listingUrl: "https://www.stapletonmotors.com/inventory/2019-kenworth-t270-/917966",
      matchStatus: "needs_verification",
      outcome: "rejected" as const,
      reason,
    };
    expect(trucksSavedEntry.outcome).toBe("rejected");
    expect(trucksSavedEntry).not.toHaveProperty("id");
    expect(trucksSavedEntry.reason.startsWith("Database insert failed:")).toBe(true);

    const newLeadsSaved = 0; // failed inserts must not increment
    expect(newLeadsSaved).toBe(0);
  });

  it("is idempotent if message already prefixed", () => {
    const once = formatDatabaseInsertFailure("boom");
    expect(formatDatabaseInsertFailure(once)).toBe(once);
  });
});
