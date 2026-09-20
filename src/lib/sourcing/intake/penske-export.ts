/**
 * Normalize Penske Used Trucks Excel/CSV export rows into the staff intake schema
 * so operators can upload the download as-is (no hand-editing).
 */
import { parseOptionalBoolFromText, parseOptionalIntFromText, parseOptionalNumberFromText } from "@/lib/sourcing/intake/parse-helpers";

function get(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const found = row[key];
    if (found != null && String(found).trim() !== "") return String(found).trim();
  }
  return "";
}

/** Headers after parseCsv / spreadsheet normalize (lowercase, spaces → _). */
export function isPenskeExportRow(row: Record<string, string>): boolean {
  const unit = get(row, "unit", "unit_number", "unitnumber");
  if (!unit) return false;
  return Boolean(
    get(row, "eng_mfr", "eng_model", "gvw_(lbs)", "gvw_lbs", "ltd_miles", "sale_price", "trans_type")
  );
}

/**
 * Stable per-unit URL for dedupe / staff follow-up.
 * Unit must live in the query string (not only the hash): canonicalizeListingUrl
 * strips hashes, and sourcing_truck_leads enforces unique canonical_listing_url —
 * hash-only URLs would collapse every Penske row onto one URL and block inserts.
 */
export function buildPenskeUnitListingUrl(unitNumber: string): string {
  const unit = String(unitNumber || "").trim();
  const encoded = encodeURIComponent(unit);
  return `https://www.penskeusedtrucks.com/search-inventory.html?unit=${encoded}#/vehicle/${encoded}`;
}

function isCummins(engMfr: string, engModel: string): boolean | null {
  const blob = `${engMfr} ${engModel}`.toLowerCase();
  if (!blob.trim()) return null;
  if (/\bcummins\b/.test(blob)) return true;
  if (/\bpaccar\b|\bpx-\d|\bcaterpillar\b|\bcat\b|\bdetroit\b|\binternational\b.*\bdiesel\b/.test(blob) && !/\bcummins\b/.test(blob)) {
    // Engine make present and not Cummins
    if (engMfr.trim() && !/cummins/i.test(engMfr)) return false;
  }
  if (engMfr.trim() && !/cummins/i.test(engMfr)) return false;
  return null;
}

function isAutomatic(transType: string): boolean | null {
  const t = transType.toLowerCase();
  if (!t) return null;
  if (/\bautomatic\b|\ballison\b/.test(t)) return true;
  if (/\bmanual\b|\bstd\b|\bstandard\b/.test(t)) return false;
  return null;
}

/**
 * Expand a Penske export row into intake aliases (stock_number, listing_url, evidence, …).
 * Non-Penske rows are returned unchanged.
 */
export function normalizePenskeExportRow(row: Record<string, string>): Record<string, string> {
  if (!isPenskeExportRow(row)) return row;

  const unit = get(row, "unit", "unit_number", "unitnumber");
  const engMfr = get(row, "eng_mfr", "engine_mfr", "engine_make");
  const engModel = get(row, "eng_model", "engine_model");
  const horsePower = get(row, "horse_power", "horsepower", "hp");
  const transType = get(row, "trans_type", "transmission_type", "transmission");
  const transMake = get(row, "trans_make");
  const transModel = get(row, "trans_model");
  const gvwRaw = get(row, "gvw_(lbs)", "gvw_lbs", "gvw", "gross_vehicle_weight");
  const milesRaw = get(row, "ltd_miles", "mileage", "miles");
  const priceRaw = get(row, "sale_price", "retail_price", "wholesale_price", "price");
  const liftgate = get(row, "liftgate", "lift_gate");
  const liftgateModel = get(row, "liftgate_model", "lift_gate_model");
  const liftgateCap = get(row, "liftgate_cap", "lift_gate_cap", "liftgate_capacity");
  const year = get(row, "year");
  const make = get(row, "make");
  const model = get(row, "model");
  const state = get(row, "state");
  const area = get(row, "area_name", "district_name", "city");
  const vin = get(row, "vin#", "vin", "vin_number");
  const type = get(row, "type");
  const comments = get(row, "comments");

  const engineParts = [engMfr, engModel, horsePower ? `${horsePower} HP` : ""].filter(Boolean);
  const engineText = engineParts.join(" ").trim();
  const transParts = [transType, transMake, transModel].filter(Boolean);
  const transText = transParts.join(" ").trim();
  const gvwLbs = parseOptionalIntFromText(gvwRaw);
  const miles = parseOptionalIntFromText(milesRaw);
  const price = parseOptionalNumberFromText(priceRaw);
  const cummins = isCummins(engMfr, engModel);
  const automatic = isAutomatic(transType);
  const hasLiftgate = parseOptionalBoolFromText(liftgate);

  const location = [area, state].filter(Boolean).join(", ");
  const makeModel = [make, model].filter(Boolean).join(" ").trim();

  const notes: string[] = [];
  if (type) notes.push(`Penske type: ${type}`);
  if (comments) notes.push(comments);
  notes.push(
    `Imported from Penske Used Trucks export (Unit ${unit}). Listing URL synthesized from unit number for intake tracking.`
  );

  const out: Record<string, string> = { ...row };

  out.seller = get(row, "seller") || "Penske Used Trucks";
  out.source_scope = get(row, "source_scope") || "penske-used-trucks";
  out.stock_number = get(row, "stock_number") || unit;
  out.source_listing_id = get(row, "source_listing_id") || unit;
  out.listing_url = get(row, "listing_url", "source_url", "url") || buildPenskeUnitListingUrl(unit);

  if (vin) out.vin = vin;
  if (year) out.year = year;
  if (makeModel) out.make_model = get(row, "make_model") || makeModel;
  if (engineText) {
    out.engine = get(row, "engine") || engineText;
    out.engine_evidence = get(row, "engine_evidence") || engineText;
  }
  if (cummins != null) out.engine_is_cummins = String(cummins);
  if (transText) {
    out.transmission = get(row, "transmission") || transText;
    out.transmission_evidence = get(row, "transmission_evidence") || transText;
  }
  if (automatic != null) out.transmission_is_automatic = String(automatic);

  if (gvwLbs != null) {
    out.manufacturer_gvwr_lbs = String(gvwLbs);
    out.listed_weight_lbs = String(gvwLbs);
    out.listed_weight_term = "gvwr";
    out.gvwr_evidence = get(row, "gvwr_evidence") || gvwRaw || `${gvwLbs} lbs`;
  }

  if (miles != null) out.mileage = String(miles);
  if (price != null) out.price = String(price);
  if (hasLiftgate != null) out.has_liftgate = String(hasLiftgate);
  if (liftgateModel || liftgateCap) {
    out.liftgate_notes = [liftgateModel, liftgateCap ? `${liftgateCap} lb` : ""]
      .filter(Boolean)
      .join(", ");
  }
  if (location) out.location = get(row, "location") || location;
  if (notes.length) out.notes = [get(row, "notes"), ...notes].filter(Boolean).join("\n");

  // Box length is not on Penske Excel export — leave unset → Needs verification for box.
  return out;
}
