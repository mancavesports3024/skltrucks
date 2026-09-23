import type {
  ComparableFieldEvidence,
  ComparableListingRaw,
} from "@/lib/sourcing/market-comparison/types";

const EMPTY_EVIDENCE: ComparableFieldEvidence = {
  askingPrice: "",
  year: "",
  makeModel: "",
  mileage: "",
};

export function emptyFieldEvidence(
  over: Partial<ComparableFieldEvidence> = {}
): ComparableFieldEvidence {
  return { ...EMPTY_EVIDENCE, ...over };
}

function digitsOnly(s: string): string {
  return String(s ?? "").replace(/[^\d]/g, "");
}

/**
 * Require inspected individual-page provenance for price, year, model, mileage.
 * Search snippets without listingPageInspected are rejected.
 */
export function verifyComparableListingEvidence(
  listing: ComparableListingRaw
): { ok: true } | { ok: false; reason: "unverified_listing_evidence" | "unsupported_required_field" | "field_evidence_mismatch" } {
  if (!listing.listingPageInspected) {
    return { ok: false, reason: "unverified_listing_evidence" };
  }

  const ev = listing.fieldEvidence ?? emptyFieldEvidence();
  const required: Array<keyof ComparableFieldEvidence> = [
    "askingPrice",
    "year",
    "makeModel",
    "mileage",
  ];
  for (const key of required) {
    if (!String(ev[key] ?? "").trim()) {
      return { ok: false, reason: "unsupported_required_field" };
    }
  }

  // Evidence text must actually support the numeric/string fields we attach to this URL.
  // Never associate a price/year/mileage with a URL by result position alone.
  if (listing.askingPrice != null) {
    const priceDigits = digitsOnly(String(Math.round(listing.askingPrice)));
    const evidenceDigits = digitsOnly(ev.askingPrice);
    if (!priceDigits || !evidenceDigits.includes(priceDigits)) {
      return { ok: false, reason: "field_evidence_mismatch" };
    }
  }

  if (listing.year != null) {
    if (!ev.year.includes(String(listing.year))) {
      return { ok: false, reason: "field_evidence_mismatch" };
    }
  }

  if (listing.mileage != null) {
    const mileDigits = digitsOnly(String(Math.round(listing.mileage)));
    const evidenceDigits = digitsOnly(ev.mileage);
    if (!mileDigits || !evidenceDigits.includes(mileDigits)) {
      return { ok: false, reason: "field_evidence_mismatch" };
    }
  }

  const modelKey = String(listing.makeModel ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const evidenceModel = String(ev.makeModel ?? "").toLowerCase();
  if (modelKey) {
    const tokens = modelKey.split(" ").filter((t) => t.length > 1);
    const supported = tokens.some((t) => evidenceModel.includes(t));
    if (!supported) {
      return { ok: false, reason: "field_evidence_mismatch" };
    }
  }

  return { ok: true };
}

export function normalizeVin(vin: string): string {
  return String(vin ?? "")
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, "")
    .trim();
}

export function normalizeStockNumber(stock: string): string {
  return String(stock ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

/** Vehicle identity key for cross-marketplace duplicates (VIN preferred, else stock). */
export function vehicleIdentityKey(listing: ComparableListingRaw): string | null {
  const vin = normalizeVin(listing.vin);
  if (vin.length >= 8) return `vin:${vin}`;
  const stock = normalizeStockNumber(listing.stockNumber);
  if (stock.length >= 3) return `stock:${stock}`;
  return null;
}
