const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM",
  "NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA",
  "WV","WI","WY",
]);

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

const PLACE_SUFFIX_RE =
  /\s+(city|town|village|cdp|borough|municipality|consolidated government|metro government|unified government|city and borough|municipio)\s*$/i;

/**
 * Strip Census legal-type suffixes ("Joplin city" → "Joplin").
 * Used when building the gazetteer from Census NAME fields.
 * Do not use alone on user "Kansas City" — that would become "Kansas".
 */
export function stripCensusPlaceSuffix(name: string): string {
  return String(name ?? "").trim().replace(PLACE_SUFFIX_RE, "").trim();
}

/**
 * Normalize a U.S. place name for gazetteer lookup (must pair with a state).
 * Collapses case, punctuation, whitespace, St./Saint, Ft./Fort.
 * Does not strip a trailing "City"/"Town" — those are part of many real place names
 * (Kansas City, Oklahoma City). Callers that need Census-suffix stripping should
 * use stripCensusPlaceSuffix separately (see resolveUsPlace).
 */
export function normalizeCityName(name: string): string {
  let s = String(name ?? "").trim();
  s = s.replace(/\./g, " ");
  s = s.replace(/\bst\b/gi, "saint");
  s = s.replace(/\bft\b/gi, "fort");
  s = s.replace(/[^a-zA-Z0-9\s'-]/g, " ");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}

export function normalizeStateCode(raw: string): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (/^[A-Za-z]{2}$/.test(text)) {
    const code = text.toUpperCase();
    return US_STATE_CODES.has(code) ? code : null;
  }
  const name = text.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
  return STATE_NAME_TO_CODE[name] ?? null;
}

export function placeLookupKey(city: string, stateCode: string): string {
  return `${normalizeCityName(city)}|${stateCode.trim().toLowerCase()}`;
}

export type ParsedUsLocation =
  | {
      ok: true;
      city: string;
      state: string;
      display: string;
      key: string;
    }
  | {
      ok: false;
      reason:
        | "empty"
        | "missing_state"
        | "missing_city"
        | "non_us_state"
        | "malformed";
      raw: string;
    };

/**
 * Parse "City, ST" (or City, StateName). Requires both city and state.
 * Does not invent a state when only a city is present.
 */
export function parseCityStateLocation(raw: string): ParsedUsLocation {
  const original = String(raw ?? "").trim();
  if (!original) return { ok: false, reason: "empty", raw: original };

  // Strip Hogan-style leading yard codes: "31 - Kansas City, MO"
  const stripped = original.replace(/^\d+\s*[-–—]\s*/, "").trim();

  // Reject obvious multi-part without a trailing state token
  const comma = stripped.lastIndexOf(",");
  if (comma < 0) {
    // "Joplin MO" without comma — allow single space before 2-letter state
    const m = stripped.match(/^(.+?)\s+([A-Za-z]{2})$/);
    if (m) {
      const city = m[1].trim();
      const state = normalizeStateCode(m[2]);
      if (!city) return { ok: false, reason: "missing_city", raw: original };
      if (!state) return { ok: false, reason: "non_us_state", raw: original };
      return {
        ok: true,
        city,
        state,
        display: `${city}, ${state}`,
        key: placeLookupKey(city, state),
      };
    }
    return { ok: false, reason: "missing_state", raw: original };
  }

  const cityPart = stripped.slice(0, comma).trim();
  const statePart = stripped.slice(comma + 1).trim();
  if (!cityPart) return { ok: false, reason: "missing_city", raw: original };
  if (!statePart) return { ok: false, reason: "missing_state", raw: original };

  // If state part has extra tokens (ZIP etc.), take first token only when it is a code
  const stateToken = statePart.split(/\s+/)[0] || statePart;
  const state =
    normalizeStateCode(statePart) ||
    normalizeStateCode(stateToken) ||
    null;
  if (!state) return { ok: false, reason: "non_us_state", raw: original };

  // City must not be empty after normalization
  if (!normalizeCityName(cityPart)) {
    return { ok: false, reason: "malformed", raw: original };
  }

  return {
    ok: true,
    city: cityPart,
    state,
    display: `${cityPart.replace(/\s+/g, " ").trim()}, ${state}`,
    key: placeLookupKey(cityPart, state),
  };
}

export function isUsStateCode(code: string): boolean {
  return US_STATE_CODES.has(code.trim().toUpperCase());
}
