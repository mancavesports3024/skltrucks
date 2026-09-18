import { describe, expect, it } from "vitest";
import {
  buildSourceListingId,
  buildSourceScope,
  canonicalizeListingUrl,
  normalizeVin,
} from "@/lib/sourcing/duplicates";

describe("duplicate keys", () => {
  it("normalizes VINs", () => {
    expect(normalizeVin(" 3alacwdt1hdhv6031 ")).toBe("3ALACWDT1HDHV6031");
  });

  it("canonicalizes listing URLs and strips tracking params", () => {
    expect(
      canonicalizeListingUrl(
        "https://Example.com/truck/123/?utm_source=x&fbclid=1#section"
      )
    ).toBe("https://example.com/truck/123");
  });

  it("scopes listing ids by seller so unrelated sellers can share a stock number", () => {
    const stock = "7908";
    const debary = {
      sourceScope: buildSourceScope({ seller: "DeBary Truck Sales" }),
      sourceListingId: buildSourceListingId({ stockNumber: stock }),
    };
    const miller = {
      sourceScope: buildSourceScope({ seller: "Miller Used Trucks" }),
      sourceListingId: buildSourceListingId({ stockNumber: stock }),
    };

    expect(debary.sourceListingId).toBe("7908");
    expect(miller.sourceListingId).toBe("7908");
    expect(debary.sourceScope).not.toBe(miller.sourceScope);
    expect(`${debary.sourceScope}:${debary.sourceListingId}`).not.toBe(
      `${miller.sourceScope}:${miller.sourceListingId}`
    );
  });

  it("falls back to source hostname when seller is blank", () => {
    expect(
      buildSourceScope({
        seller: "",
        sourceUrl: "https://www.debarytrucksales.com/inventory/123",
      })
    ).toBe("debarytrucksales-com");
  });
});
