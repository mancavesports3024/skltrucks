import { describe, expect, it } from "vitest";
import {
  META_INVENTORY_CSV_HEADERS,
  buildMetaInventoryFeed,
  escapeCsvField,
  formatCsv,
  isProductAvailableForFeed,
  parseMileageValue,
  productToMetaRow,
} from "@/lib/meta/inventory-feed";
import type { Product } from "@/types/product";

function baseProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "truck-1",
    slug: "2019-freightliner-m2-demo",
    name: "2019 Freightliner M2",
    price: 49950,
    image: "https://example.com/truck.jpg",
    images: ["https://example.com/truck.jpg"],
    categories: ["Day Cabs", "Freightliner"],
    categorySlugs: ["day-cabs", "freightliner-day-cabs"],
    cabType: "day-cabs",
    type: "day-cabs",
    manufacturer: "freightliner",
    vin: "3ALACWFC4KDKE8505",
    year: "2019",
    model: "M2",
    miles: "112,168",
    hours: "",
    condition: "Used",
    comments: "Recent service.",
    details: {
      Color: "White",
      "Fuel Type": "Diesel",
      "Trans Type": "Automatic",
    },
    published: true,
    ...overrides,
  };
}

describe("CSV formatting", () => {
  it("escapes commas, quotes, and newlines per RFC-style CSV", () => {
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("writes a header row and quoted address JSON", () => {
    const feed = buildMetaInventoryFeed([baseProduct()]);
    const lines = feed.csv.trimEnd().split("\n");
    expect(lines[0]).toBe(META_INVENTORY_CSV_HEADERS.join(","));
    expect(lines).toHaveLength(2);
    expect(feed.csv).toContain("49950 USD");
    expect(feed.csv).toContain("image[0].url");
    expect(feed.rows[0].address).toContain('"city":"Joplin"');
    expect(formatCsv(["a", "b"], [{ a: "1", b: "2,3" }])).toBe('a,b\n1,"2,3"\n');
  });
});

describe("availability filtering", () => {
  it("includes every available truck and excludes sold/unpublished ones", () => {
    const availableA = baseProduct({ id: "a", slug: "a", vin: "3ALACWFC4JDJL7861" });
    const availableB = baseProduct({
      id: "b",
      slug: "b",
      vin: "3HSDZAPR0MN463455",
      manufacturer: "international",
      model: "LT625",
    });
    const sold = baseProduct({
      id: "sold",
      slug: "sold",
      published: false,
      vin: "1HTMMMMLXKH682538",
    });

    expect(isProductAvailableForFeed(availableA)).toBe(true);
    expect(isProductAvailableForFeed(sold)).toBe(false);

    const feed = buildMetaInventoryFeed([availableA, sold, availableB]);
    expect(feed.rows).toHaveLength(2);
    expect(feed.rows.map((r) => r.vehicle_id).sort()).toEqual(["a", "b"]);
    expect(feed.csv).not.toContain("sold");
    expect(feed.rows.every((r) => r.availability === "available")).toBe(true);
  });
});

describe("live price and listing fields", () => {
  it("reflects updated prices and listing URLs without a hand-edited CSV", () => {
    const before = buildMetaInventoryFeed([baseProduct({ price: 40000 })]);
    const after = buildMetaInventoryFeed([baseProduct({ price: 38500 })]);

    expect(before.rows[0].price).toBe("40000 USD");
    expect(after.rows[0].price).toBe("38500 USD");
    expect(after.rows[0].url).toBe(
      "https://www.skltrucks.com/product/2019-freightliner-m2-demo"
    );
    expect(after.rows[0]["image[0].url"]).toBe("https://example.com/truck.jpg");
    expect(after.rows[0].vehicle_type).toBe("commercial");
    expect(parseMileageValue("112,168")).toBe(112168);
  });
});

describe("validation reporting", () => {
  it("reports blank manufacturer instead of inventing a make", () => {
    const { row, issues } = productToMetaRow(
      baseProduct({
        id: "blank-make",
        slug: "2004-c6500-1gdj6c1c24f515142",
        manufacturer: "",
        name: "2004 GMC C6500 Flat Bed",
        model: "C6500",
        year: "2004",
        vin: "1GDJ6C1C24F515142",
      })
    );

    expect(row.make).toBe("");
    expect(issues.some((i) => i.field === "make" && i.severity === "missing")).toBe(true);
    expect(issues.some((i) => i.message.toLowerCase().includes("gmc"))).toBe(true);
  });

  it("reports missing exterior color and condition without inventing values", () => {
    const { row, issues } = productToMetaRow(
      baseProduct({
        condition: "",
        details: { "Fuel Type": "Diesel" },
      })
    );

    expect(row.exterior_color).toBe("");
    expect(row.state_of_vehicle).toBe("");
    expect(issues.some((i) => i.field === "exterior_color")).toBe(true);
    expect(issues.some((i) => i.field === "state_of_vehicle")).toBe(true);
  });

  it("reports VIN make conflicts when manufacturer disagrees with WMI", () => {
    const { issues } = productToMetaRow(
      baseProduct({
        manufacturer: "kenworth",
        vin: "3ALACWFC0PDUK1576",
      })
    );

    expect(issues.some((i) => i.field === "make" && i.severity === "conflict")).toBe(true);
  });
});
