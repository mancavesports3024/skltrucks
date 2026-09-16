import { SITE } from "@/lib/constants";
import { getManufacturerLabel, normalizeManufacturerSlug } from "@/lib/product-labels";
import { absoluteUrl } from "@/lib/seo/site-url";
import type { Product } from "@/types/product";

/**
 * Meta Automotive Inventory Ads (Vehicles catalog) feed helpers.
 * Spec: https://developers.facebook.com/docs/marketing-api/auto-ads/reference/
 *
 * SKL commercial trucks qualify via vehicle_type=commercial and body_style=TRUCK|VAN.
 */

export const META_INVENTORY_CSV_HEADERS = [
  "vehicle_id",
  "title",
  "description",
  "url",
  "make",
  "model",
  "year",
  "mileage.value",
  "mileage.unit",
  "image[0].url",
  "body_style",
  "price",
  "exterior_color",
  "state_of_vehicle",
  "address",
  "latitude",
  "longitude",
  "vin",
  "vehicle_type",
  "availability",
  "dealer_name",
  "dealer_phone",
  "transmission",
  "fuel_type",
] as const;

export type MetaInventoryCsvHeader = (typeof META_INVENTORY_CSV_HEADERS)[number];

export type MetaInventoryCsvRow = Record<MetaInventoryCsvHeader, string>;

export type MetaFeedIssueSeverity = "missing" | "conflict";

export interface MetaFeedIssue {
  vehicleId: string;
  slug: string;
  field: string;
  severity: MetaFeedIssueSeverity;
  message: string;
}

export interface MetaInventoryFeedResult {
  rows: MetaInventoryCsvRow[];
  issues: MetaFeedIssue[];
  csv: string;
}

/** Public dealership location required by Meta vehicle feeds (not per-truck data). */
export const META_DEALERSHIP = {
  name: SITE.name,
  phone: `+1 ${SITE.phone}`,
  address: {
    addr1: "4000 W 7th St",
    city: "Joplin",
    region: "MO",
    postal_code: "64801",
    country: "US",
  },
  /** Approximate coordinates for 4000 W 7th St, Joplin, MO 64801 */
  latitude: "37.08497",
  longitude: "-94.55334",
} as const;

const BOX_TRUCK_SLUG = "delivery-moving-straight-refrigerated-box-trucks";

/** Common WMI → expected make slug for conflict detection (not used to invent make). */
const VIN_WMI_MAKE: Record<string, string> = {
  "1FU": "freightliner",
  "1FV": "freightliner",
  "3AL": "freightliner",
  "3AK": "freightliner",
  "1HT": "international",
  "3HA": "international",
  "3HS": "international",
  "1XP": "peterbilt",
  "1XK": "kenworth",
  "1XKW": "kenworth",
  "4V4": "volvo",
  "1M1": "mack",
  "JHH": "hino",
  "JAL": "isuzu",
  "1GD": "gmc",
  "1GT": "gmc",
};

export function isProductAvailableForFeed(product: Product): boolean {
  return product.published !== false;
}

export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatCsv(headers: readonly string[], rows: Record<string, string>[]): string {
  const lines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => headers.map((h) => escapeCsvField(row[h] ?? "")).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

export function parseMileageValue(miles: string): number | null {
  const digits = miles.replace(/[^\d]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

function detailValue(details: Record<string, string>, ...keys: string[]): string {
  const entries = Object.entries(details);
  for (const key of keys) {
    const exact = details[key];
    if (exact?.trim()) return exact.trim();
    const found = entries.find(([k]) => k.trim().toLowerCase() === key.toLowerCase());
    if (found?.[1]?.trim()) return found[1].trim();
  }
  return "";
}

export function mapStateOfVehicle(condition: string): string {
  const normalized = condition.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "new") return "New";
  if (normalized === "cpo" || normalized.includes("certified")) return "CPO";
  if (normalized === "used" || normalized === "pre-owned" || normalized === "preowned") {
    return "Used";
  }
  return "";
}

export function mapBodyStyle(product: Product): string {
  const cab = (product.cabType || product.type || "").trim().toLowerCase();
  if (cab === BOX_TRUCK_SLUG || cab.includes("box") || cab.includes("delivery")) {
    return "VAN";
  }
  return "TRUCK";
}

export function mapTransmission(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) return "";
  if (v.includes("auto")) return "Automatic";
  if (v.includes("manual")) return "Manual";
  return "";
}

export function mapFuelType(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) return "";
  if (v.includes("diesel")) return "DIESEL";
  if (v.includes("electric")) return "ELECTRIC";
  if (v.includes("hybrid")) return "HYBRID";
  if (v.includes("flex")) return "FLEX";
  if (v.includes("gas") || v.includes("petrol")) return "GASOLINE";
  return "OTHER";
}

function makeLabel(manufacturer: string): string {
  const slug = normalizeManufacturerSlug(manufacturer);
  if (!slug) return "";
  return getManufacturerLabel(slug);
}

function expectedMakeFromVin(vin: string): string | null {
  const clean = vin.trim().toUpperCase();
  if (clean.length < 3) return null;
  const four = clean.slice(0, 4);
  if (VIN_WMI_MAKE[four]) return VIN_WMI_MAKE[four];
  const three = clean.slice(0, 3);
  return VIN_WMI_MAKE[three] ?? null;
}

function buildDescription(product: Product, make: string): string {
  const parts: string[] = [];
  const year = product.year.trim();
  const model = product.model.trim();
  const headline = [year, make, model].filter(Boolean).join(" ");
  if (headline) parts.push(`${headline} available from ${SITE.name}.`);

  if (product.miles?.trim()) parts.push(`Mileage: ${product.miles.trim()} miles.`);
  if (product.hours?.trim()) parts.push(`Hours: ${product.hours.trim()}.`);
  if (product.vin?.trim()) parts.push(`VIN: ${product.vin.trim()}.`);

  const comments = product.comments?.trim();
  if (comments) parts.push(comments);

  const engine = detailValue(product.details, "Engine Model", "Engine");
  const hp = detailValue(product.details, "Engine HP");
  if (engine) parts.push(hp ? `Engine: ${engine} (${hp} HP).` : `Engine: ${engine}.`);

  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 5000);

  const fallback = product.name.trim().replace(/\s+/g, " ");
  return fallback.slice(0, 5000);
}

function buildTitle(product: Product, make: string): string {
  const year = product.year.trim();
  const model = product.model.trim();
  const composed = [year, make, model].filter(Boolean).join(" ").trim();
  if (composed) return composed.slice(0, 500);
  return product.name.trim().replace(/\s+/g, " ").slice(0, 500);
}

function dealerAddressJson(): string {
  return JSON.stringify(META_DEALERSHIP.address);
}

export function productToMetaRow(product: Product): {
  row: MetaInventoryCsvRow;
  issues: MetaFeedIssue[];
} {
  const vehicleId = product.id;
  const issues: MetaFeedIssue[] = [];
  const push = (field: string, severity: MetaFeedIssueSeverity, message: string) => {
    issues.push({ vehicleId, slug: product.slug, field, severity, message });
  };

  const make = makeLabel(product.manufacturer);
  if (!product.manufacturer.trim()) {
    push("make", "missing", "Manufacturer is blank on the inventory record");
  }

  const model = product.model.trim();
  if (!model) push("model", "missing", "Model is blank");

  const year = product.year.trim();
  if (!year || !/^\d{4}$/.test(year)) {
    push("year", "missing", "Year must be a 4-digit value");
  }

  const mileage = parseMileageValue(product.miles ?? "");
  if (mileage === null) {
    push("mileage.value", "missing", "Miles is blank or not numeric");
  }

  const imageUrl = (product.image || product.images?.[0] || "").trim();
  if (!imageUrl) {
    push("image[0].url", "missing", "Primary image URL is missing");
  } else if (!/^https?:\/\//i.test(imageUrl)) {
    push("image[0].url", "conflict", "Primary image URL is not absolute");
  }

  if (!Number.isFinite(product.price) || product.price <= 0) {
    push("price", "missing", "Price is missing or not positive");
  }

  const exteriorColor = detailValue(product.details, "Color", "Exterior Color");
  if (!exteriorColor) {
    push("exterior_color", "missing", "No Color field in product details");
  }

  const stateOfVehicle = mapStateOfVehicle(product.condition ?? "");
  if (!stateOfVehicle) {
    if (product.condition?.trim()) {
      push(
        "state_of_vehicle",
        "conflict",
        `Unrecognized condition "${product.condition.trim()}" (expected New, Used, or CPO)`
      );
    } else {
      push("state_of_vehicle", "missing", "Condition is blank");
    }
  }

  const vin = product.vin.trim().toUpperCase();
  if (vin) {
    if (vin.length !== 17) {
      push("vin", "conflict", `VIN length is ${vin.length}, expected 17`);
    }
    const expected = expectedMakeFromVin(vin);
    const actualSlug = normalizeManufacturerSlug(product.manufacturer);
    if (expected && actualSlug && actualSlug !== expected) {
      push(
        "make",
        "conflict",
        `Listed make "${make || actualSlug}" conflicts with VIN WMI (expected ${getManufacturerLabel(expected) || expected})`
      );
    } else if (expected && !actualSlug) {
      push(
        "make",
        "conflict",
        `Manufacturer blank but VIN WMI suggests ${getManufacturerLabel(expected) || expected}`
      );
    }
  }

  const title = buildTitle(product, make);
  if (!title) push("title", "missing", "Title could not be built");

  const description = buildDescription(product, make);
  if (!description) push("description", "missing", "Description could not be built");

  const transmission = mapTransmission(detailValue(product.details, "Trans Type", "Transmission"));
  const fuelType = mapFuelType(detailValue(product.details, "Fuel Type", "Fuel"));

  const row: MetaInventoryCsvRow = {
    vehicle_id: vehicleId,
    title,
    description,
    url: absoluteUrl(`/product/${product.slug}`),
    make,
    model,
    year,
    "mileage.value": mileage === null ? "" : String(mileage),
    "mileage.unit": "MI",
    "image[0].url": imageUrl,
    body_style: mapBodyStyle(product),
    price: Number.isFinite(product.price) && product.price > 0 ? `${Math.round(product.price)} USD` : "",
    exterior_color: exteriorColor,
    state_of_vehicle: stateOfVehicle,
    address: dealerAddressJson(),
    latitude: META_DEALERSHIP.latitude,
    longitude: META_DEALERSHIP.longitude,
    vin: vin.length === 17 ? vin : vin,
    vehicle_type: "commercial",
    availability: "available",
    dealer_name: META_DEALERSHIP.name,
    dealer_phone: META_DEALERSHIP.phone,
    transmission,
    fuel_type: fuelType,
  };

  return { row, issues };
}

/**
 * Build a Meta Vehicles catalog CSV from the same published inventory used by /shop.
 * Unpublished / sold trucks (published === false) are excluded.
 */
export function buildMetaInventoryFeed(products: Product[]): MetaInventoryFeedResult {
  const available = products.filter(isProductAvailableForFeed);
  const rows: MetaInventoryCsvRow[] = [];
  const issues: MetaFeedIssue[] = [];

  for (const product of available) {
    const { row, issues: rowIssues } = productToMetaRow(product);
    rows.push(row);
    issues.push(...rowIssues);
  }

  return {
    rows,
    issues,
    csv: formatCsv(META_INVENTORY_CSV_HEADERS, rows),
  };
}
