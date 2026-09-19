import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { candidateToContactInput } from "@/lib/sourcing/search/map-candidates";
import {
  normalizeSearchPayload,
  parseDiscoveryPayloadJson,
  parseInspectPayloadJson,
  parseSearchPayloadJson,
} from "@/lib/sourcing/search/openai-normalize";

const failedFixture = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../../fixtures/sourcing/openai-sources-consulted-no-listing-url.json"),
    "utf8"
  )
);

describe("regression: sourcesConsulted without truck.listingUrl", () => {
  it("does not invent listingUrls by zipping sourcesConsulted into trucks", () => {
    const result = normalizeSearchPayload(failedFixture);

    expect(result.payload.trucks).toHaveLength(0);
    expect(result.rejectedTrucks.length).toBeGreaterThanOrEqual(5);
    expect(
      result.rejectedTrucks.some((r) =>
        /Missing listingUrl/i.test(r.reason)
      )
    ).toBe(true);

    // All five source URLs remain untied — never assigned by index
    expect(result.untiedSources).toEqual(failedFixture.sourcesConsulted);
    expect(
      result.rejectedTrucks.some((r) =>
        /could not be unambiguously tied/i.test(r.reason)
      )
    ).toBe(true);

    // Contacts from the failure lack company + sourceUrl
    expect(result.payload.contacts).toHaveLength(0);
    expect(result.rejectedContacts.length).toBe(4);
  });

  it("parseSearchPayloadJson drops incomplete trucks (same fixture)", () => {
    const payload = parseSearchPayloadJson(JSON.stringify(failedFixture));
    expect(payload.trucks).toEqual([]);
    expect(payload.sourcesConsulted).toEqual(failedFixture.sourcesConsulted);
    expect(payload.contacts).toEqual([]);
  });

  it("never maps sourcesConsulted[i] onto trucks[i] even when lengths match", () => {
    const crafted = {
      trucks: [
        { location: "A", year: 2019 },
        { location: "B", year: 2020 },
      ],
      contacts: [],
      sourcesConsulted: [
        "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-mock-intake-9001",
        "https://www.millerusedtrucks.com/inventory/used-2018-freightliner-m2-mock-383999",
      ],
      queriesUsed: [],
      notes: "",
    };
    const result = normalizeSearchPayload(crafted);
    expect(result.payload.trucks).toHaveLength(0);
    expect(result.untiedSources).toEqual(crafted.sourcesConsulted);
    // Explicitly prove we did not attach URL 0 to truck 0
    expect(result.payload.trucks.find((t) => t.location === "A")).toBeUndefined();
  });
});

describe("stage1 discovery parsing", () => {
  it("keeps only individual listing URLs from listingUrls", () => {
    const discovery = parseDiscoveryPayloadJson(
      JSON.stringify({
        listingUrls: [
          "https://www.truckandvanoutlet.com/for-sale/2020-international-mv607-26-box-truck-with-liftgate-cummins-power-allison-automatic-214k-miles-non-cdl-14490868",
          "https://www.penskeusedtrucks.com/search-inventory/",
          "https://www.youtube.com/watch?v=abc",
        ],
        queriesUsed: ["q1"],
        sourcesConsulted: [],
        notes: "",
      })
    );
    expect(discovery.listingUrls).toHaveLength(1);
    expect(discovery.listingUrls[0]).toContain("truckandvanoutlet.com/for-sale/");
  });
});

describe("stage2 inspect binding", () => {
  const supplied =
    "https://www.truckandvanoutlet.com/for-sale/2020-international-mv607-26-box-truck-with-liftgate-cummins-power-allison-automatic-214k-miles-non-cdl-14490868";

  it("accepts a truck only when listingUrl equals the supplied URL verbatim", () => {
    const ok = parseInspectPayloadJson(
      JSON.stringify({
        truck: {
          listingUrl: supplied,
          seller: "Truck and Van Outlet",
          engine: "Cummins",
          engineIsCummins: true,
          engineEvidence: "Listing states Cummins",
          phone: "(877) 555-0100",
        },
        contact: {
          companyName: "Truck and Van Outlet",
          phone: "(877) 555-0100",
          sourceUrl: "https://www.truckandvanoutlet.com/contact",
        },
        rejectReason: "",
      }),
      supplied
    );
    expect(ok.truck?.listingUrl).toBe(supplied);
    expect(ok.contact?.company).toBe("Truck and Van Outlet");
    expect(ok.contact?.sourceUrl).toBeTruthy();
  });

  it("rejects when listingUrl differs from the supplied URL", () => {
    const bad = parseInspectPayloadJson(
      JSON.stringify({
        truck: {
          listingUrl:
            "https://www.otherdealer.com/inventory/used-2020-something-else",
          seller: "Other",
        },
        contact: null,
        rejectReason: "",
      }),
      supplied
    );
    expect(bad.truck).toBeNull();
    expect(bad.rejectReason).toMatch(/verbatim|mismatch/i);
  });

  it("rejects rewriting listingUrl to a sourcesConsulted peer", () => {
    const peer =
      "https://www.dastrucks.net/inventory/2020-international-mv607/1088433";
    const bad = parseInspectPayloadJson(
      JSON.stringify({
        truck: { listingUrl: peer, seller: "DAS" },
        rejectReason: "",
      }),
      supplied
    );
    expect(bad.truck).toBeNull();
  });
});

describe("contact required fields", () => {
  it("requires company, phone, and sourceUrl", () => {
    expect(
      candidateToContactInput({
        company: "Dealer",
        contactName: "",
        role: "",
        phone: "(407) 321-4244",
        email: "",
        sourceUrl: "",
        supplierType: "",
        evidenceQuote: "",
        notes: "",
      }).rejectReason
    ).toMatch(/sourceUrl/i);

    expect(
      candidateToContactInput({
        company: "",
        contactName: "",
        role: "",
        phone: "(407) 321-4244",
        email: "",
        sourceUrl: "https://example.com/contact",
        supplierType: "",
        evidenceQuote: "",
        notes: "",
      }).rejectReason
    ).toMatch(/company/i);

    expect(
      candidateToContactInput({
        company: "Dealer",
        contactName: "",
        role: "",
        phone: "(407) 321-4244",
        email: "",
        sourceUrl: "https://example.com/contact",
        supplierType: "",
        evidenceQuote: "Contact page lists phone",
        notes: "",
      }).rejectReason
    ).toBeUndefined();
  });
});
