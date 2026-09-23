/**
 * Deterministic US-only country resolution for SKL sourcing.
 * No network, geocoding, OpenAI, or Tavily.
 *
 * CA ambiguity:
 * - In a U.S. state / "City, ST" trailing token → California
 * - In an explicit country field → Canada
 */

export const UNITED_STATES = "United States";
export const CANADA = "Canada";

const CANADIAN_PROVINCE_CODES = new Set([
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
  // Common aliases
  "PQ", // Quebec
  "YK", // Yukon
]);

const CANADIAN_PROVINCE_NAME_TO_CODE: Record<string, string> = {
  alberta: "AB",
  "british columbia": "BC",
  manitoba: "MB",
  "new brunswick": "NB",
  newfoundland: "NL",
  "newfoundland and labrador": "NL",
  "nova scotia": "NS",
  "northwest territories": "NT",
  nunavut: "NU",
  ontario: "ON",
  "prince edward island": "PE",
  pei: "PE",
  quebec: "QC",
  québec: "QC",
  saskatchewan: "SK",
  yukon: "YT",
  "yukon territory": "YT",
};

/** USPS state codes — includes CA as California when used as a state token. */
const US_STATE_CODES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
]);

const US_STATE_NAMES = new Set([
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "district of columbia",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
]);

const US_COUNTRY_ALIASES = new Set([
  "us",
  "usa",
  "u.s",
  "u.s.",
  "u.s.a",
  "u.s.a.",
  "united states",
  "united states of america",
]);

/** Explicit country-field aliases for Canada (includes CA). */
const CANADA_COUNTRY_FIELD_ALIASES = new Set(["canada", "can", "ca"]);

/** Location-string country tokens for Canada (CA alone is NOT Canada here). */
const CANADA_LOCATION_COUNTRY_ALIASES = new Set(["canada", "can"]);

const KNOWN_FOREIGN_COUNTRY_NAMES: Record<string, string> = {
  mexico: "Mexico",
  méxico: "Mexico",
  "united kingdom": "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  germany: "Germany",
  france: "France",
  australia: "Australia",
  china: "China",
  japan: "Japan",
  brazil: "Brazil",
  india: "India",
};

/**
 * Explicit country-field only. Includes ISO-ish short codes that collide with
 * U.S. states when used as City, ST tokens (DE/Germany, IN/India, etc.).
 */
const KNOWN_FOREIGN_COUNTRY_FIELD_ALIASES: Record<string, string> = {
  ...KNOWN_FOREIGN_COUNTRY_NAMES,
  mx: "Mexico",
  mex: "Mexico",
  uk: "United Kingdom",
  de: "Germany",
  fr: "France",
  au: "Australia",
  cn: "China",
  jp: "Japan",
  br: "Brazil",
  // "in" omitted — too ambiguous even as a country field vs Indiana habit
};

export type CountryResolution =
  | { kind: "us"; country: typeof UNITED_STATES }
  | { kind: "foreign"; country: string }
  | { kind: "unknown" };

export type ResolveCountryInput = {
  /** Free-text location (e.g. "Toronto, ON" or "Los Angeles, CA"). */
  location?: string | null;
  /**
   * Explicit country field (CSV / separate workbook column / form).
   * Ambiguous `CA` means Canada here.
   */
  country?: string | null;
  /**
   * Separate state/province field (e.g. Penske State column).
   * Ambiguous `CA` means California here.
   */
  stateOrProvince?: string | null;
};

function cleanToken(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function titleCountry(label: string): string {
  return label
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

export function isCanadianProvinceCode(code: string): boolean {
  return CANADIAN_PROVINCE_CODES.has(String(code ?? "").trim().toUpperCase());
}

export function isUsStateCode(code: string): boolean {
  return US_STATE_CODES.has(String(code ?? "").trim().toUpperCase());
}

export function normalizeCanadianProvince(raw: string): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (/^[A-Za-z]{2}$/.test(text)) {
    const code = text.toUpperCase();
    if (CANADIAN_PROVINCE_CODES.has(code)) {
      return code === "PQ" ? "QC" : code === "YK" ? "YT" : code;
    }
    return null;
  }
  const name = cleanToken(text);
  if (name === "pei") return "PE";
  return CANADIAN_PROVINCE_NAME_TO_CODE[name] ?? null;
}

/**
 * Normalize an explicit country field value.
 * `CA` → Canada; `US`/`USA`/… → United States.
 */
export function normalizeExplicitCountryField(raw: string): CountryResolution {
  const text = String(raw ?? "").trim();
  if (!text) return { kind: "unknown" };
  const key = cleanToken(text);

  if (US_COUNTRY_ALIASES.has(key)) {
    return { kind: "us", country: UNITED_STATES };
  }
  if (CANADA_COUNTRY_FIELD_ALIASES.has(key)) {
    return { kind: "foreign", country: CANADA };
  }
  if (KNOWN_FOREIGN_COUNTRY_FIELD_ALIASES[key]) {
    return { kind: "foreign", country: KNOWN_FOREIGN_COUNTRY_FIELD_ALIASES[key] };
  }
  // Unrecognized free-text country names: treat as explicit foreign when clearly a word
  // longer than 2 chars (avoid inventing foreign from random tokens like "ZZ").
  if (/^[a-z]{3,}$/i.test(key) && !US_STATE_NAMES.has(key) && !CANADIAN_PROVINCE_NAME_TO_CODE[key]) {
    return { kind: "foreign", country: titleCountry(text) };
  }
  return { kind: "unknown" };
}

function resolveStateOrProvinceToken(
  raw: string,
  /** When true, two-letter CA means California (state field / City, ST). */
  caMeansCalifornia: boolean
): CountryResolution {
  const text = String(raw ?? "").trim();
  if (!text) return { kind: "unknown" };

  const province = normalizeCanadianProvince(text);
  if (province) return { kind: "foreign", country: CANADA };

  if (/^[A-Za-z]{2}$/.test(text)) {
    const code = text.toUpperCase();
    if (code === "CA" && caMeansCalifornia) {
      return { kind: "us", country: UNITED_STATES };
    }
    if (isUsStateCode(code)) {
      return { kind: "us", country: UNITED_STATES };
    }
    // Unrecognized 2-letter code — do not assume foreign
    return { kind: "unknown" };
  }

  const name = cleanToken(text);
  if (US_STATE_NAMES.has(name)) {
    return { kind: "us", country: UNITED_STATES };
  }
  if (CANADIAN_PROVINCE_NAME_TO_CODE[name]) {
    return { kind: "foreign", country: CANADA };
  }
  return { kind: "unknown" };
}

function resolveCountryTokenFromLocation(raw: string): CountryResolution {
  const key = cleanToken(raw);
  if (!key) return { kind: "unknown" };
  if (US_COUNTRY_ALIASES.has(key)) return { kind: "us", country: UNITED_STATES };
  if (CANADA_LOCATION_COUNTRY_ALIASES.has(key)) {
    return { kind: "foreign", country: CANADA };
  }
  // Full country names only — never 2-letter ISO codes here (DE=Delaware, etc.).
  if (KNOWN_FOREIGN_COUNTRY_NAMES[key]) {
    return { kind: "foreign", country: KNOWN_FOREIGN_COUNTRY_NAMES[key] };
  }
  return { kind: "unknown" };
}

/**
 * Resolve whether a lead is in the United States, an explicit foreign country,
 * or still unknown. Never invents a foreign country from an unresolved city.
 */
export function resolveLeadCountry(input: ResolveCountryInput): CountryResolution {
  const explicit = String(input.country ?? "").trim();
  if (explicit) {
    const fromField = normalizeExplicitCountryField(explicit);
    if (fromField.kind !== "unknown") return fromField;
  }

  const stateField = String(input.stateOrProvince ?? "").trim();
  if (stateField) {
    const fromState = resolveStateOrProvinceToken(stateField, true);
    if (fromState.kind === "foreign") return fromState;
    // US state alone is eligible; continue to scan location for overriding country words
  }

  const original = String(input.location ?? "").trim();
  if (!original && stateField) {
    return resolveStateOrProvinceToken(stateField, true);
  }
  if (!original) return { kind: "unknown" };

  // Strip Hogan-style leading yard codes: "31 - Kansas City, MO"
  const stripped = original.replace(/^\d+\s*[-–—]\s*/, "").trim();

  const parts = stripped
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    // "City, ON, Canada" or "City, State, USA"
    const last = resolveCountryTokenFromLocation(parts[parts.length - 1]);
    if (last.kind !== "unknown") return last;
    const mid = resolveStateOrProvinceToken(parts[parts.length - 2], true);
    if (mid.kind !== "unknown") return mid;
  }

  if (parts.length === 2) {
    const countryOrRegion = resolveCountryTokenFromLocation(parts[1]);
    if (countryOrRegion.kind !== "unknown") return countryOrRegion;
    const region = resolveStateOrProvinceToken(parts[1], true);
    if (region.kind !== "unknown") return region;
  }

  if (parts.length === 1) {
    // Free-form single tokens must not invent a foreign country from city names
    // that collide with countries/provinces (Mexico MO, Ontario CA, Quebec, …).
    // Only unambiguous country-only aliases, bare region codes, or "City ST" apply.
    const sole = parts[0];
    const soleKey = cleanToken(sole);

    // Unambiguous country-only phrases (never U.S. city names).
    if (
      US_COUNTRY_ALIASES.has(soleKey) ||
      CANADA_LOCATION_COUNTRY_ALIASES.has(soleKey) ||
      soleKey === "united kingdom" ||
      soleKey === "great britain" ||
      soleKey === "united states of america"
    ) {
      const asCountry = resolveCountryTokenFromLocation(sole);
      if (asCountry.kind !== "unknown") return asCountry;
    }

    // Bare 2-letter state/province code only (ON → Canada, MO → US, CA → California).
    if (/^[A-Za-z]{2}$/.test(sole)) {
      const region = resolveStateOrProvinceToken(sole, true);
      if (region.kind !== "unknown") return region;
    }

    // "Joplin MO" / "Toronto ON" without comma
    const m = sole.match(/^(.+?)\s+([A-Za-z]{2})$/);
    if (m) {
      const region = resolveStateOrProvinceToken(m[2], true);
      if (region.kind !== "unknown") return region;
    }

    // Do not treat lone province/country words (Ontario, Mexico, Quebec, …) as foreign.
    return { kind: "unknown" };
  }

  // Explicit "Canada" / "CAN" anywhere remaining (e.g. unusual punctuation).
  if (/\bCanada\b/i.test(stripped) || /\bCAN\b/.test(stripped)) {
    return { kind: "foreign", country: CANADA };
  }

  // Do not scan embedded province/country city names — "Ontario, CA" and "Mexico, MO"
  // already resolved via the trailing state token above.

  if (stateField) {
    return resolveStateOrProvinceToken(stateField, true);
  }

  return { kind: "unknown" };
}

export function countryRejectionReason(country: string): string {
  return `Outside allowed country: ${country}`;
}

/** True when Census / Joplin distance should be skipped. */
export function shouldSkipUsDistanceLookup(resolution: CountryResolution): boolean {
  return resolution.kind === "foreign";
}
