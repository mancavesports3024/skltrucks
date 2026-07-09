import { MANUFACTURERS } from "@/lib/constants";

export interface VpicResult {
  Make?: string;
  Model?: string;
  ModelYear?: string;
  ErrorCode?: string;
  ErrorText?: string;
  [key: string]: string | undefined;
}

export interface DecodedVin {
  year: string;
  model: string;
  manufacturer: string;
  manufacturerLabel: string;
  make: string;
  warnings: string[];
}

const MAKE_ALIASES: Record<string, string> = {
  FREIGHTLINER: "freightliner",
  "FREIGHTLINER LLC": "freightliner",
  "DTNA": "freightliner",
  INTERNATIONAL: "international",
  "INTERNATIONAL TRUCK": "international",
  "NAVISTAR": "international",
  KENWORTH: "kenworth",
  PETERBILT: "peterbilt",
  MACK: "mack",
  VOLVO: "volvo",
  HINO: "hino",
  ISUZU: "isuzu",
};

function manufacturerSlugFromMake(make: string): string {
  const normalized = make.trim().toUpperCase();
  if (!normalized) return "";

  if (MAKE_ALIASES[normalized]) return MAKE_ALIASES[normalized];

  for (const m of MANUFACTURERS) {
    const label = m.label.toUpperCase();
    if (normalized === label || normalized.includes(label)) return m.slug;
  }

  const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const known = MANUFACTURERS.find((m) => m.slug === slug);
  return known?.slug ?? "";
}

export function mapVpicResult(result: VpicResult): DecodedVin | { error: string } {
  const errorCode = (result.ErrorCode ?? "").trim();
  if (errorCode && errorCode !== "0") {
    return { error: result.ErrorText?.trim() || "Could not decode this VIN." };
  }

  const make = (result.Make ?? "").trim();
  const model = (result.Model ?? "").trim();
  const year = (result.ModelYear ?? "").trim();
  const warnings: string[] = [];

  if (!make && !model && !year) {
    return { error: "No vehicle data returned for this VIN." };
  }

  const manufacturer = manufacturerSlugFromMake(make);
  const manufacturerLabel = MANUFACTURERS.find((m) => m.slug === manufacturer)?.label ?? make;

  if (make && !manufacturer) {
    warnings.push(`Manufacturer "${make}" is not in your inventory list — select it manually.`);
  }

  return {
    year,
    model,
    manufacturer,
    manufacturerLabel,
    make,
    warnings,
  };
}

export async function fetchVpicDecode(vin: string, modelYear?: string): Promise<VpicResult> {
  const params = new URLSearchParams({ format: "json" });
  if (modelYear?.trim()) params.set("modelyear", modelYear.trim());

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?${params}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error("NHTSA VIN service is unavailable. Try again in a moment.");
  }

  const data = (await res.json()) as { Results?: VpicResult[] };
  return data.Results?.[0] ?? {};
}
