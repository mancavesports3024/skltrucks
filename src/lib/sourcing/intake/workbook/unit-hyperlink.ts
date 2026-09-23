/**
 * Classify Penske workbook Unit Number cell hyperlinks.
 * Never invents unit pages from unit numbers. Never rewrites unsafe URLs into safe ones.
 * Does not fetch or crawl destinations.
 *
 * Inspection URLs (e.g. National Inspect) are private sourcing data: path segments may be
 * capability tokens even when not named "token". Never log or expose full inspection URLs
 * outside authenticated sourcing-staff surfaces.
 */
import { canonicalizeListingUrl } from "@/lib/sourcing/duplicates";

/** Formulas that must never be treated as extractable hyperlink sources. */
const DANGEROUS_FORMULA_RE =
  /\b(CMD|DDE|DDEAUTO|EXEC|WEBSERVICE|FILTERXML|IMPORTXML|INDIRECT|EXTERNAL|RTD)\b|^\s*=?\s*\|/i;

/**
 * Extract a hyperlink Target from a SheetJS cell without evaluating formulas.
 * Prefer native `cell.l.Target` (xlsx hyperlink records). For BIFF/.xls workbooks that
 * store Excel `HYPERLINK("url",…)` as formula text in `cell.f`, parse the quoted URL
 * string only — never execute the formula. DDE/external/malformed formulas fail closed.
 *
 * Display argument (2nd) may be a quoted label, `TRIM(A1)`, or a simple cell ref — never
 * concatenated into the URL and never evaluated.
 */
export function extractWorkbookHyperlinkTarget(
  cell: { l?: { Target?: string } | unknown; f?: string } | null | undefined
): string {
  if (!cell || typeof cell !== "object") return "";
  if (cell.l && typeof cell.l === "object" && "Target" in cell.l) {
    const target = String((cell.l as { Target?: string }).Target ?? "").trim();
    if (target) return target;
  }
  const formula = typeof cell.f === "string" ? cell.f.trim() : "";
  if (!formula) return "";
  if (DANGEROUS_FORMULA_RE.test(formula)) return "";
  // First argument must be a complete quoted URL literal. Optional display arg is ignored.
  const m = formula.match(
    /^=?\s*HYPERLINK\s*\(\s*"((?:[^"]|"")*)"\s*(?:,([\s\S]*))?\)\s*$/i
  );
  if (!m) return "";
  const displayArg = (m[2] ?? "").trim();
  if (displayArg) {
    if (DANGEROUS_FORMULA_RE.test(displayArg) || /&/.test(displayArg)) return "";
    // Allow only a quoted label, TRIM(cell), or a simple A1-style ref — never evaluate.
    if (
      !/^"(?:[^"]|"")*"$|^TRIM\s*\(\s*[A-Z]{1,3}\d+\s*\)$|^[A-Z]{1,3}\d+$/i.test(displayArg)
    ) {
      return "";
    }
  }
  return m[1].replace(/""/g, '"').trim();
}

/** Public Penske individual unit hostnames. */
export const PENSKE_LISTING_ALLOWED_HOSTS = new Set([
  "penskeusedtrucks.com",
  "www.penskeusedtrucks.com",
]);

/**
 * Explicitly approved inspection/report hostnames for Penske unit-cell links.
 * Synthetic fixture host included for tests only.
 */
export const PENSKE_INSPECTION_ALLOWED_HOSTS = [
  "inspection-reports.example.test",
  "reports.nationalinspect.com",
  "nationalinspect.com",
  "www.nationalinspect.com",
  "www.fleetinspect.com",
  "fleetinspect.com",
  "app.fleetinspect.com",
  "reports.rwis.com",
  "www.rwis.com",
  "inspect.rigdig.com",
  "www.rigdig.com",
] as const;

const UNIT_PATH_RE = /\/unit-(\d+)\/?/i;

/** Staff-safe rejection for unsupported hosts or credential-bearing destinations. */
export const INSPECTION_REJECT_UNSUPPORTED =
  "unsupported or credential-bearing destination";

export const INSPECTION_REJECT_UNSUPPORTED_NOTE =
  "Inspection hyperlink rejected — unsupported or credential-bearing destination";

/** Query keys that look like credentials / sessions / signed URLs. */
const FORBIDDEN_QUERY_KEY_RE =
  /^(authorization|auth|token|access[_-]?token|api[_-]?key|client[_-]?id|x-ibm-client-id|x-pnsk-client-id|session|asp\.net_sessionid|window_name|request[_-]?id|cookie|signature|sig|expires|expire|exp|jwt|id_token|refresh_token|x-amz-signature|x-amz-credential|x-amz-security-token|key|guid)$/i;

const FORBIDDEN_QUERY_KEY_PARTIAL_RE =
  /(token|auth|authorization|cookie|session|window_name|client-id|client_id|api[_-]?key|signature|signed)/i;

/** JWT-like compact serialization in a query value. */
const JWT_LIKE_VALUE_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

export type PenskeUnitHyperlinkKind = "listingUrl" | "inspectionUrl" | "rejected" | "missing";

export type PenskeUnitHyperlinkClassification = {
  kind: PenskeUnitHyperlinkKind;
  /** Safe absolute HTTPS URL when kind is listingUrl or inspectionUrl; otherwise "". */
  url: string;
  hostname: string;
  /** Staff-safe reason (never includes sensitive query values or full unsafe URLs). */
  reason: string;
  /** Preview note for staff. */
  previewNote: string;
};

function safeReject(reason: string): PenskeUnitHyperlinkClassification {
  return {
    kind: "rejected",
    url: "",
    hostname: "",
    reason,
    previewNote: `Workbook hyperlink rejected: ${reason}`,
  };
}

function rejectUnsupportedOrCredential(): PenskeUnitHyperlinkClassification {
  return {
    kind: "rejected",
    url: "",
    hostname: "",
    reason: INSPECTION_REJECT_UNSUPPORTED,
    previewNote: INSPECTION_REJECT_UNSUPPORTED_NOTE,
  };
}

function hostAllowed(host: string, allowlist: readonly string[] | Set<string>): boolean {
  const h = host.toLowerCase();
  if (allowlist instanceof Set) return allowlist.has(h);
  return allowlist.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
}

function hasCredentialLikeQuery(parsed: URL): string | null {
  for (const [key, value] of parsed.searchParams.entries()) {
    if (FORBIDDEN_QUERY_KEY_RE.test(key) || FORBIDDEN_QUERY_KEY_PARTIAL_RE.test(key)) {
      return `credential-like query parameter "${key}"`;
    }
    const trimmed = String(value ?? "").trim();
    if (JWT_LIKE_VALUE_RE.test(trimmed)) {
      return "JWT-like query value";
    }
  }
  return null;
}

function isLoginOrAccountPath(path: string): boolean {
  return /\/(login|signin|sign-in|account|auth|sso|oauth)(\/|$)/i.test(path);
}

function isApiPath(path: string): boolean {
  return /\/(api|graphql|rest|v\d+)(\/|$)/i.test(path) || /\.json$/i.test(path);
}

function isSearchOrCategoryPath(path: string): boolean {
  if (UNIT_PATH_RE.test(path)) return false;
  return (
    /search-inventory/i.test(path) ||
    /\/(search|results|category|categories|listings|inventory)(\/|$)/i.test(path)
  );
}

function isIndividualPenskeUnitPath(path: string): boolean {
  return UNIT_PATH_RE.test(path || "");
}

/**
 * Classify a raw hyperlink Target from a Penske Unit Number cell.
 * Display cell text must not be passed here as a substitute for hyperlink metadata.
 */
export function classifyPenskeUnitHyperlink(
  raw: string | null | undefined
): PenskeUnitHyperlinkClassification {
  const text = String(raw ?? "").trim();
  if (!text) {
    return {
      kind: "missing",
      url: "",
      hostname: "",
      reason: "No hyperlink provided",
      previewNote: "No hyperlink provided",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    // Relative or malformed
    if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
      return safeReject("relative or malformed URL");
    }
    return safeReject("malformed URL");
  }

  if (parsed.protocol !== "https:") {
    return safeReject(parsed.protocol === "http:" ? "HTTP URL" : "non-HTTPS URL");
  }

  if (parsed.username || parsed.password) {
    return safeReject("URL userinfo is not allowed");
  }

  if (parsed.hash && parsed.hash.replace(/^#/, "").length > 0) {
    return safeReject("URL fragments are not allowed");
  }

  const cred = hasCredentialLikeQuery(parsed);
  if (cred) {
    // Do not echo parameter values or full URL — staff-safe generic note.
    return rejectUnsupportedOrCredential();
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname || "/";

  if (isLoginOrAccountPath(path)) {
    return safeReject("login/account page");
  }
  if (isApiPath(path)) {
    return safeReject("internal API URL");
  }
  if (isSearchOrCategoryPath(path)) {
    return safeReject("search/category hub URL");
  }

  // Listing: approved Penske host + individual unit path
  if (hostAllowed(host, PENSKE_LISTING_ALLOWED_HOSTS) && isIndividualPenskeUnitPath(path)) {
    const normalized = canonicalizeListingUrl(
      (() => {
        const out = new URL(`https://${host}${path.replace(/\/+$/, "") || "/"}`);
        // Strip all query for stable public unit pages (session material already rejected)
        return out.toString();
      })()
    );
    return {
      kind: "listingUrl",
      url: normalized,
      hostname: host,
      reason: "Individual Penske unit page",
      previewNote: "Individual listing link found",
    };
  }

  // Inspection: approved inspection host, not a hub/login/api
  // Keep full URL for private staff storage only — path may contain capability tokens.
  if (hostAllowed(host, PENSKE_INSPECTION_ALLOWED_HOSTS)) {
    const out = new URL(parsed.toString());
    out.hash = "";
    return {
      kind: "inspectionUrl",
      url: out.toString(),
      hostname: host,
      reason: "Approved inspection/report page",
      previewNote: "Inspection link found",
    };
  }

  if (hostAllowed(host, PENSKE_LISTING_ALLOWED_HOSTS) && !isIndividualPenskeUnitPath(path)) {
    return safeReject("Penske URL is not an individual unit page");
  }

  return rejectUnsupportedOrCredential();
}

/**
 * Staff-safe hostname/path diagnostics (never logs full URL with capability tokens).
 * Opaque path segments (possible capability tokens) are masked.
 */
export function maskHyperlinkForDiagnostics(raw: string): {
  hostname: string;
  pathPattern: string;
  hasQuery: boolean;
  queryKeyNames: string[];
} {
  try {
    const u = new URL(String(raw).trim());
    const path = (u.pathname || "/")
      .replace(/\/unit-\d+/gi, "/unit-{id}")
      .replace(
        /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        "/{uuid}"
      )
      .replace(/\/[0-9a-f]{16,}/gi, "/{hex}")
      .replace(/\/[A-Za-z0-9_-]{16,}/g, "/{token}")
      .replace(/\/\d{3,}/g, "/{id}");
    return {
      hostname: u.hostname.toLowerCase(),
      pathPattern: path,
      hasQuery: [...u.searchParams.keys()].length > 0,
      queryKeyNames: [...u.searchParams.keys()].map((k) => k.toLowerCase()),
    };
  } catch {
    return { hostname: "(unparseable)", pathPattern: "", hasQuery: false, queryKeyNames: [] };
  }
}
