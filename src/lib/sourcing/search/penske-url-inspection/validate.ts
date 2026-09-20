/**
 * Validate staff-pasted Penske individual unit URLs for inspect-only runs.
 * Rejects hubs, search pages, credentials, fragments, and session-shaped params.
 */
import { PENSKE_URL_INSPECTION_MAX_URLS } from "@/lib/sourcing/search/penske-url-inspection/flag";

const ALLOWED_HOSTS = new Set(["penskeusedtrucks.com", "www.penskeusedtrucks.com"]);

const UNIT_PATH_RE = /\/unit-(\d+)\/?/i;

const FORBIDDEN_QUERY_KEY_RE =
  /(token|auth|authorization|cookie|session|window_name|client-id|x-ibm-client-id|x-pnsk-client-id)/i;

export type PenskeUrlValidationFailure = {
  ok: false;
  error: string;
  invalidUrl?: string;
};

export type PenskeUrlValidationSuccess = {
  ok: true;
  urls: string[];
};

export type PenskeUrlValidationResult = PenskeUrlValidationSuccess | PenskeUrlValidationFailure;

function reject(error: string, invalidUrl?: string): PenskeUrlValidationFailure {
  return { ok: false, error, invalidUrl };
}

/**
 * Normalize a single already-parsed valid unit URL for dedupe / storage.
 * Host lowercased; trailing slash stripped from pathname; hash must already be empty.
 */
export function normalizePenskeUnitUrl(parsed: URL): string {
  const host = parsed.hostname.toLowerCase();
  let path = parsed.pathname || "/";
  path = path.replace(/\/+$/, "") || "/";
  const unitMatch = path.match(UNIT_PATH_RE);
  if (unitMatch) {
    path = path.replace(UNIT_PATH_RE, `/unit-${unitMatch[1]}`);
  }
  const out = new URL(`https://${host}${path}`);
  if (parsed.search && parsed.search.length > 1) {
    out.search = parsed.search;
  }
  return out.toString();
}

export function validatePenskeUnitUrl(
  raw: string
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: "Empty URL line." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: `Not a valid URL: ${trimmed}` };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: `HTTPS required (got ${parsed.protocol || "none"}): ${trimmed}` };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: `URLs must not include usernames or passwords: ${trimmed}` };
  }

  if (parsed.hash && parsed.hash.replace(/^#/, "").length > 0) {
    return { ok: false, error: `URL fragments are not allowed: ${trimmed}` };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return {
      ok: false,
      error: `Host must be penskeusedtrucks.com or www.penskeusedtrucks.com (got ${parsed.hostname}): ${trimmed}`,
    };
  }

  const pathLower = (parsed.pathname || "").toLowerCase();
  if (pathLower.includes("search-inventory")) {
    return { ok: false, error: `search-inventory URLs are not supported: ${trimmed}` };
  }
  if (
    /\/(search|results|category|categories|listings)(\/|$)/i.test(pathLower) &&
    !UNIT_PATH_RE.test(parsed.pathname)
  ) {
    return { ok: false, error: `Category/search hub URLs are not supported: ${trimmed}` };
  }

  if (!UNIT_PATH_RE.test(parsed.pathname || "")) {
    return {
      ok: false,
      error: `URL must be an individual Penske unit page with /unit-{digits}/ in the path: ${trimmed}`,
    };
  }

  for (const key of parsed.searchParams.keys()) {
    if (FORBIDDEN_QUERY_KEY_RE.test(key)) {
      return {
        ok: false,
        error: `Query parameter "${key}" looks like a session/credential and is not allowed: ${trimmed}`,
      };
    }
  }

  return { ok: true, url: normalizePenskeUnitUrl(parsed) };
}

/**
 * Parse staff textarea (one URL per line). Rejects the whole request if any line is invalid.
 * Max 10 unique normalized URLs.
 */
export function parseAndValidatePenskeUnitUrls(text: string): PenskeUrlValidationResult {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length === 0) {
    return reject("Paste 1–10 individual Penske unit URLs (one per line).");
  }

  if (lines.length > PENSKE_URL_INSPECTION_MAX_URLS) {
    return reject(
      `At most ${PENSKE_URL_INSPECTION_MAX_URLS} URLs per run (got ${lines.length} lines before dedupe).`
    );
  }

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const result = validatePenskeUnitUrl(line);
    if (!result.ok) {
      return reject(result.error, line);
    }
    if (seen.has(result.url)) continue;
    seen.add(result.url);
    unique.push(result.url);
  }

  if (unique.length === 0) {
    return reject("No unique Penske unit URLs after normalization.");
  }

  if (unique.length > PENSKE_URL_INSPECTION_MAX_URLS) {
    return reject(
      `At most ${PENSKE_URL_INSPECTION_MAX_URLS} unique URLs per run (got ${unique.length}).`
    );
  }

  return { ok: true, urls: unique };
}
