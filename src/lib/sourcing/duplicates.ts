/**
 * Canonicalize an individual listing URL for duplicate detection.
 * Strips tracking params and trailing slashes; returns empty string if blank.
 */
export function canonicalizeListingUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    const drop = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "msclkid",
    ]);
    [...parsed.searchParams.keys()].forEach((key) => {
      if (drop.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        parsed.searchParams.delete(key);
      }
    });
    let path = parsed.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    parsed.pathname = path;
    return parsed.toString().toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

export function normalizeVin(vin: string): string {
  return vin.trim().toUpperCase().replace(/\s+/g, "");
}

export function buildSourceListingId(parts: {
  sourceListingId?: string;
  stockNumber?: string;
  seller?: string;
}): string {
  const explicit = (parts.sourceListingId ?? "").trim();
  if (explicit) return explicit.toLowerCase();

  const stock = (parts.stockNumber ?? "").trim();
  const seller = (parts.seller ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  if (stock && seller) return `${seller}:${stock.toLowerCase()}`;
  if (stock) return stock.toLowerCase();
  return "";
}

export function duplicateConflictMessage(errorMessage: string): string | null {
  const msg = errorMessage.toLowerCase();
  if (msg.includes("sourcing_truck_leads_vin_unique")) {
    return "A lead with this VIN already exists.";
  }
  if (msg.includes("sourcing_truck_leads_source_listing_id_unique")) {
    return "A lead with this source listing ID / stock number already exists.";
  }
  if (msg.includes("sourcing_truck_leads_canonical_url_unique")) {
    return "A lead with this listing URL already exists.";
  }
  if (msg.includes("duplicate key")) {
    return "Duplicate lead detected (VIN, listing ID, or URL).";
  }
  return null;
}
