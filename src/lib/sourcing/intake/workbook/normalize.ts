/**
 * Deterministic field normalization for authorized dealer workbooks.
 * No LLM / OpenAI / Tavily — spreadsheet values only.
 */

const MAKE_ALIASES: Record<string, string> = {
  ftl: "Freightliner",
  freightliner: "Freightliner",
  ihc: "International",
  international: "International",
  ford: "Ford",
  chevy: "Chevrolet",
  chevrolet: "Chevrolet",
  gmc: "GMC",
  isuzu: "Isuzu",
  hino: "Hino",
  kenworth: "Kenworth",
  peterbilt: "Peterbilt",
};

const ENGINE_ALIASES: Record<string, string> = {
  cum: "Cummins",
  cummins: "Cummins",
};

/** Parse GVW / GVWR strings including `25.5k`, `26k`, `31k`, `25,500`, `25999 lbs`. */
export function parseWeightLbs(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const kMatch = text.match(/^([\d,.]+)\s*k\b/i);
  if (kMatch) {
    const base = Number(kMatch[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) return null;
    return Math.round(base * 1000);
  }

  const cleaned = text.replace(/,/g, "").replace(/[^\d.]/g, " ");
  const num = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!num) return null;
  const n = Number(num[1]);
  if (!Number.isFinite(n)) return null;
  // Heuristic: values like 25.5 with a trailing k already handled; bare 25.5 → unlikely lbs
  if (n > 0 && n < 100 && /k/i.test(text)) return Math.round(n * 1000);
  if (n <= 0) return null;
  return Math.round(n);
}

export function parseMileage(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).replace(/,/g, " ").replace(/miles?|hrs?\.?/gi, " ");
  const m = text.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function parsePrice(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).replace(/[$,\s]/g, "").replace(/usd/i, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function parseYear(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const m = String(raw).match(/(19|20)\d{2}/);
  if (!m) return null;
  const y = Number(m[0]);
  return y >= 1990 && y <= 2100 ? y : null;
}

export function normalizeMake(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const mapped = MAKE_ALIASES[t.toLowerCase()];
  return mapped || t;
}

export function normalizeEngineMake(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const mapped = ENGINE_ALIASES[t.toLowerCase()];
  return mapped || t;
}

export function isCumminsEngine(engineText: string): boolean | null {
  const blob = engineText.trim().toLowerCase();
  if (!blob) return null;
  if (/\bcummins\b|\bcum\b/.test(blob)) return true;
  if (
    /\bpaccar\b|\bpx-?\d|\bcaterpillar\b|\b\bcat\b|\bdetroit\b|\bisuzu\b|\bhino\b|\bford\b|\bpowerstroke\b|\bduramax\b|\bnavistar\b/.test(
      blob
    )
  ) {
    return false;
  }
  return null;
}

export function isAutomaticTransmission(transText: string): boolean | null {
  const t = transText.trim().toLowerCase();
  if (!t) return null;
  if (/\bauto(matic)?\b|\ballison\b/.test(t)) return true;
  if (/\bmanual\b|\bstd\b|\bstandard\b|\b\d+\s*speed\s*manual\b/.test(t)) return false;
  // Bare gear counts without auto/allison stay unknown
  return null;
}

export type BodyKind = "dry_van" | "reefer" | "flatbed" | "other" | "unknown";

export function classifyBodyKind(typeOrDescription: string): BodyKind {
  const t = typeOrDescription.trim().toLowerCase();
  if (!t) return "unknown";
  if (/\breefer\b|\brefrig/.test(t)) return "reefer";
  if (/\bflat\s*bed\b|\bflatbed\b/.test(t)) return "flatbed";
  if (/\bvan\b|\bbox\b|\bdry\b/.test(t) && !/\breefer\b/.test(t)) return "dry_van";
  if (/\bother\b/.test(t)) return "other";
  return "unknown";
}

/** Extract 24 / 26 / 28 from descriptions like `26FT SAD MEDIUM VAN` or `26'`. */
export function extractBoxLengthFt(text: string): number | null {
  if (!text.trim()) return null;
  const patterns = [
    /\b(24|26|28)\s*(?:'|′)?\s*(?:ft\.?|foot|feet)?\b/i,
    /\b(24|26|28)FT\b/i,
    /\bL\s*[:=]?\s*(24|26|28)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      // Avoid matching unrelated numbers like years — require ft marker or bare length column
      const full = m[0];
      if (/ft|foot|feet|'|′/i.test(full) || /^(24|26|28)$/i.test(text.trim())) {
        return Number(m[1]);
      }
      if (/\b(24|26|28)\s*(?:'|′|ft)/i.test(text)) return Number(m[1]);
    }
  }
  const withMark = text.match(/\b(24|26|28)\s*(?:'|′|ft\.?|foot|feet)\b/i);
  if (withMark) return Number(withMark[1]);
  const ftStuck = text.match(/\b(24|26|28)FT\b/i);
  if (ftStuck) return Number(ftStuck[1]);
  // Hogan "Length" column may be bare 26 / 26'
  const bare = text.trim().match(/^(24|26|28)(?:\.0+)?(?:\s*'|′|ft)?$/i);
  if (bare) return Number(bare[1]);
  // "24' box" — feet mark then more text
  const marked = text.match(/\b(24|26|28)\s*['′]/);
  if (marked) return Number(marked[1]);
  return null;
}

export type LiftgateParse = {
  hasLiftgate: boolean | null;
  notes: string;
};

/**
 * Blank liftgate → unknown (not automatically "no").
 * Numeric capacities (2500, 3000) and RAMP → present with notes.
 */
export function parseLiftgate(raw: string | null | undefined): LiftgateParse {
  if (raw == null) return { hasLiftgate: null, notes: "" };
  const text = String(raw).trim();
  if (!text) return { hasLiftgate: null, notes: "" };

  const lower = text.toLowerCase();
  if (["no", "n", "none", "false", "0", "-"].includes(lower)) {
    return { hasLiftgate: false, notes: text };
  }
  if (["yes", "y", "true"].includes(lower)) {
    return { hasLiftgate: true, notes: text };
  }
  if (/\bramp\b/i.test(text)) {
    return { hasLiftgate: true, notes: `Ramp (${text})` };
  }
  const cap = text.match(/(\d[\d,]*)/);
  if (cap) {
    const lbs = Number(cap[1].replace(/,/g, ""));
    if (Number.isFinite(lbs) && lbs > 0) {
      return { hasLiftgate: true, notes: `${lbs.toLocaleString()}-pound liftgate` };
    }
  }
  return { hasLiftgate: true, notes: text };
}

/** `31 - Kansas City, MO` → city/state label; Canadian provinces left as unknown distance. */
export function parseOsLocation(raw: string): {
  location: string;
  city: string;
  state: string;
  looksCanadian: boolean;
} {
  const text = String(raw ?? "").trim();
  if (!text) return { location: "", city: "", state: "", looksCanadian: false };

  const stripped = text.replace(/^\d+\s*[-–—]\s*/, "").trim();
  const looksCanadian =
    /\b(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\b/.test(stripped) ||
    /\b(Canada|Ontario|Alberta|Quebec|British Columbia|Manitoba|Saskatchewan)\b/i.test(
      stripped
    );

  const m = stripped.match(/^(.+?),\s*([A-Z]{2})\s*$/);
  if (m) {
    return {
      location: `${m[1].trim()}, ${m[2]}`,
      city: m[1].trim(),
      state: m[2],
      looksCanadian,
    };
  }
  return { location: stripped || text, city: "", state: "", looksCanadian };
}

export function headerKey(h: string): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/[#./']/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}