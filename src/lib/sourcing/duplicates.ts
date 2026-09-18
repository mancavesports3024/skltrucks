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

export function slugifySourceScope(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Scope for listing-ID uniqueness: prefer seller slug, else source URL hostname.
 * Unrelated sellers can share the same stock / listing id.
 */
export function buildSourceScope(parts: {
  seller?: string;
  sourceUrl?: string;
  sourceScope?: string;
}): string {
  const explicit = slugifySourceScope(parts.sourceScope ?? "");
  if (explicit) return explicit;

  const seller = slugifySourceScope(parts.seller ?? "");
  if (seller) return seller;

  const url = (parts.sourceUrl ?? "").trim();
  if (!url) return "";
  try {
    return slugifySourceScope(new URL(url).hostname.replace(/^www\./, ""));
  } catch {
    return "";
  }
}

/**
 * Local listing id within a source scope (stock number or explicit id).
 * Does not embed seller — uniqueness is (source_scope, source_listing_id).
 */
export function buildSourceListingId(parts: {
  sourceListingId?: string;
  stockNumber?: string;
}): string {
  const explicit = (parts.sourceListingId ?? "").trim().toLowerCase();
  if (explicit) return explicit;
  const stock = (parts.stockNumber ?? "").trim().toLowerCase();
  return stock;
}

/** @deprecated Prefer buildSourceScope + buildSourceListingId */
export function buildScopedListingKey(parts: {
  sourceListingId?: string;
  stockNumber?: string;
  seller?: string;
  sourceUrl?: string;
}): { sourceScope: string; sourceListingId: string } {
  return {
    sourceScope: buildSourceScope(parts),
    sourceListingId: buildSourceListingId(parts),
  };
}

export function duplicateConflictMessage(errorMessage: string): string | null {
  const msg = errorMessage.toLowerCase();
  if (msg.includes("sourcing_truck_leads_vin_unique")) {
    return "A lead with this VIN already exists.";
  }
  if (
    msg.includes("sourcing_truck_leads_scoped_listing_unique") ||
    msg.includes("sourcing_truck_leads_source_listing_id_unique")
  ) {
    return "A lead with this source listing ID already exists for this seller/source.";
  }
  if (msg.includes("sourcing_truck_leads_canonical_url_unique")) {
    return "A lead with this listing URL already exists.";
  }
  if (msg.includes("duplicate key")) {
    return "Duplicate lead detected (VIN, scoped listing ID, or URL).";
  }
  return null;
}
