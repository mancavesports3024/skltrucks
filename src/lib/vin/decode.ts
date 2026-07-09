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
  suggestedTitle: string;
  details: Record<string, string>;
  filledFields: string[];
  raw: Record<string, string>;
  warnings: string[];
}

const MAKE_ALIASES: Record<string, string> = {
  FREIGHTLINER: "freightliner",
  "FREIGHTLINER LLC": "freightliner",
  DTNA: "freightliner",
  INTERNATIONAL: "international",
  "INTERNATIONAL TRUCK": "international",
  NAVISTAR: "international",
  KENWORTH: "kenworth",
  PETERBILT: "peterbilt",
  MACK: "mack",
  VOLVO: "volvo",
  HINO: "hino",
  ISUZU: "isuzu",
};

function pick(...values: (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

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

export function trimVpicRaw(result: VpicResult): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(result)) {
    const trimmed = (value ?? "").trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

export function buildSuggestedTitle(parts: {
  year: string;
  manufacturerLabel: string;
  make: string;
  model: string;
}): string {
  const brand = parts.manufacturerLabel || parts.make;
  return [parts.year, brand, parts.model].filter(Boolean).join(" ");
}

export function mapVpicToDetails(result: VpicResult): Record<string, string> {
  const details: Record<string, string> = {};

  const gvwr = pick(result.GVWR);
  if (gvwr) details["GVWR"] = gvwr;

  const fuel = pick(result.FuelTypePrimary, result.FuelTypeSecondary);
  if (fuel) details["Fuel Type"] = fuel;

  const brakes = pick(result.BrakeSystemType);
  if (brakes) details["Brakes"] = brakes;

  const vehicleClass = pick(result.BodyClass, result.VehicleType);
  if (vehicleClass) details["Class"] = vehicleClass;

  const axleConfig = [pick(result.DriveType), pick(result.Axles)].filter(Boolean).join(" / ");
  if (axleConfig) details["Axle Configuration"] = axleConfig;

  const wheelbase = pick(result.WheelBase, result.WheelBaseFrom, result.WheelBaseTo);
  if (wheelbase) details["Wheelbase"] = wheelbase;

  const engineModel = pick(result.EngineModel);
  const engineMfr = pick(result.EngineManufacturer);
  const engine = [engineMfr, engineModel].filter(Boolean).join(" ").trim();
  if (engine) details["Engine Model"] = engine;
  else if (pick(result.DisplacementL)) details["Engine Model"] = `${pick(result.DisplacementL)}L`;

  const engineHp = pick(result.EngineHP);
  if (engineHp) details["Engine HP"] = engineHp;

  const transParts = [pick(result.TransmissionStyle), pick(result.TransmissionSpeeds)].filter(Boolean);
  if (transParts.length) {
    details["Trans Type"] = transParts.join(" ");
    if (pick(result.TransmissionSpeeds)) details["Trans Speed"] = pick(result.TransmissionSpeeds);
  }

  return details;
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

  const details = mapVpicToDetails(result);
  const filledFields = [
    year && "Year",
    (manufacturer || make) && "Manufacturer",
    model && "Model",
    ...Object.keys(details),
  ].filter(Boolean) as string[];

  return {
    year,
    model,
    manufacturer,
    manufacturerLabel,
    make,
    suggestedTitle: buildSuggestedTitle({ year, manufacturerLabel, make, model }),
    details,
    filledFields,
    raw: trimVpicRaw(result),
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

export const VIN_DECODE_META_KEY = "_vinDecode";

export function buildVinDecodeMeta(vin: string, raw: Record<string, string>): string {
  return JSON.stringify({
    decodedAt: new Date().toISOString(),
    vin,
    fields: raw,
  });
}

export function getPublicDetails(details: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(details).filter(([key]) => !key.startsWith("_")));
}
