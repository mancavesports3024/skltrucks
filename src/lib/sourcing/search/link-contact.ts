/**
 * Unambiguous truck ↔ supplier-contact linking for the internet search pilot.
 * Matches only when company name, phone, or listing/source domain points to
 * exactly one contact — never invents or guesses among multiple candidates.
 */

export type LinkableContact = {
  id: string;
  company: string;
  phone: string;
  sourceUrl: string;
};

export type TruckLinkHints = {
  seller?: string;
  phone?: string;
  listingUrl?: string;
  sourceUrl?: string;
  companyName?: string;
  contactName?: string;
};

/** Digits only; strips leading US country code 1 when length is 11. */
export function normalizePhoneDigits(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/** Hostname without leading www., lowercased. */
export function listingDomain(url: string): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeCompanyKey(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when seller looks like a hostname / host-slug placeholder rather than
 * a human company name (e.g. "globetrucks-com", "globetrucks.com").
 */
export function looksLikeHostnameSeller(seller: string, listingUrl?: string): boolean {
  const s = String(seller || "").trim();
  if (!s) return true;
  if (/\s/.test(s)) return false;
  if (/\./.test(s)) return true;
  // slugified host: "globetrucks-com" matching listing host
  const domain = listingDomain(listingUrl || "");
  if (!domain) return /^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(s) && /-(com|net|org|io|co)$/i.test(s);
  const hostSlug = domain.replace(/\./g, "-");
  const hostLeft = domain.split(".")[0] || "";
  const key = s.toLowerCase();
  return key === hostSlug || key === hostLeft || key === domain;
}

/**
 * Prefer a real company name over a hostname-derived seller slug when we have
 * an unambiguous contact match.
 */
export function preferSellerDisplayName(
  seller: string,
  listingUrl: string,
  contactCompany: string | null | undefined
): string {
  const company = String(contactCompany || "").trim();
  if (!company) return String(seller || "").trim();
  if (looksLikeHostnameSeller(seller, listingUrl)) return company;
  return String(seller || "").trim() || company;
}

function contactMatchesTruck(truck: TruckLinkHints, contact: LinkableContact): boolean {
  const truckPhone = normalizePhoneDigits(truck.phone || "");
  const contactPhone = normalizePhoneDigits(contact.phone);
  if (truckPhone && contactPhone && truckPhone === contactPhone) return true;

  const companyKeys = [
    normalizeCompanyKey(truck.seller || ""),
    normalizeCompanyKey(truck.companyName || ""),
  ].filter(Boolean);
  const contactKey = normalizeCompanyKey(contact.company);
  if (contactKey && companyKeys.some((k) => k === contactKey)) return true;

  const truckDomain =
    listingDomain(truck.listingUrl || "") || listingDomain(truck.sourceUrl || "");
  const contactDomain = listingDomain(contact.sourceUrl);
  if (truckDomain && contactDomain && truckDomain === contactDomain) return true;

  return false;
}

/**
 * Return the single contact that unambiguously matches the truck on company,
 * phone, or source domain. Returns null when zero or multiple contacts match.
 */
export function findUnambiguousContactMatch(
  truck: TruckLinkHints,
  contacts: LinkableContact[]
): LinkableContact | null {
  const matches = contacts.filter((c) => c?.id && contactMatchesTruck(truck, c));
  if (matches.length === 0) return null;
  // Deduplicate by id in case the same contact was supplied twice
  const byId = new Map(matches.map((m) => [m.id, m]));
  if (byId.size !== 1) return null;
  return [...byId.values()][0];
}

/** Format a DB insert failure so it cannot be mistaken for a saved lead. */
export function formatDatabaseInsertFailure(errorMessage: string): string {
  const msg = String(errorMessage || "unknown database error").trim();
  if (/^database insert failed:/i.test(msg)) return msg;
  return `Database insert failed: ${msg}`;
}
