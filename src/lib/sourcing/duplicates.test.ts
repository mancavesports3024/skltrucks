import { describe, expect, it } from "vitest";
import {
  buildSourceListingId,
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

  it("builds source listing ids from stock + seller when needed", () => {
    expect(
      buildSourceListingId({ seller: "DeBary Truck Sales", stockNumber: "7908" })
    ).toBe("debary-truck-sales:7908");
    expect(buildSourceListingId({ sourceListingId: "ABC-1" })).toBe("abc-1");
  });
});
