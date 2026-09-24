/**
 * Discovery-time URL classification for the read-only Tavily benchmark.
 * Reuses production listing URL gate + credential rejection patterns.
 * Does NOT claim a truck matches — discovery only finds plausible URLs.
 */
import { canonicalizeListingUrl } from "@/lib/sourcing/duplicates";
import {
  isBlockedListingHost,
  isIndividualListingUrl,
} from "@/lib/sourcing/search/map-candidates";

export type DiscoveryUrlBucket =
  | "individual_listing"
  | "likely_listing_needs_inspection"
  | "hub_or_category"
  | "unsupported_or_unsafe";

export type DiscoveryUrlClassification = {
  rawUrl: string;
  canonicalUrl: string;
  bucket: DiscoveryUrlBucket;
  hostname: string;
  /** Staff-safe reason; never echoes secrets. */
  reason: string;
};

const FORBIDDEN_QUERY_KEY_RE =
  /^(authorization|auth|token|access[_-]?token|api[_-]?key|client[_-]?id|x-ibm-client-id|x-pnsk-client-id|session|asp\.net_sessionid|window_name|request[_-]?id|cookie|signature|sig|expires|expire|exp|jwt|id_token|refresh_token|x-amz-signature|x-amz-credential|x-amz-security-token|key|guid)$/i;

const FORBIDDEN_QUERY_KEY_PARTIAL_RE =
  /(token|auth|authorization|cookie|session|window_name|client-id|client_id|api[_-]?key|signature|signed)/i;

const JWT_LIKE_VALUE_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

const HUB_PATH_RE =
  /\/(search|search-inventory|results|category|categories|listings|for-sale|trucks-for-sale|shop|used|inventory)\/?$/i;

function hasCredentialLikeQuery(parsed: URL): string | null {
  for (const [key, value] of parsed.searchParams.entries()) {
    if (FORBIDDEN_QUERY_KEY_RE.test(key) || FORBIDDEN_QUERY_KEY_PARTIAL_RE.test(key)) {
      return `credential-like query parameter`;
    }
    if (JWT_LIKE_VALUE_RE.test(String(value ?? "").trim())) {
      return "JWT-like query value";
    }
  }
  return null;
}

/**
 * Classify a discovery hit URL into a retention bucket.
 * Rejects credentials, userinfo, fragments, session-shaped params.
 */
export function classifyDiscoveryUrl(rawUrl: string): DiscoveryUrlClassification {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed) {
    return {
      rawUrl: "",
      canonicalUrl: "",
      bucket: "unsupported_or_unsafe",
      hostname: "",
      reason: "empty URL",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      rawUrl: trimmed,
      canonicalUrl: "",
      bucket: "unsupported_or_unsafe",
      hostname: "",
      reason: "unparseable URL",
    };
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    return {
      rawUrl: trimmed,
      canonicalUrl: "",
      bucket: "unsupported_or_unsafe",
      hostname: parsed.hostname,
      reason: "non-http(s) scheme",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      rawUrl: trimmed,
      canonicalUrl: "",
      bucket: "unsupported_or_unsafe",
      hostname: parsed.hostname.replace(/^www\./, ""),
      reason: "URL userinfo is not allowed",
    };
  }

  if (parsed.hash && parsed.hash.length > 1) {
    return {
      rawUrl: trimmed,
      canonicalUrl: "",
      bucket: "unsupported_or_unsafe",
      hostname: parsed.hostname.replace(/^www\./, ""),
      reason: "URL fragment is not allowed",
    };
  }

  const cred = hasCredentialLikeQuery(parsed);
  if (cred) {
    return {
      rawUrl: trimmed,
      canonicalUrl: "",
      bucket: "unsupported_or_unsafe",
      hostname: parsed.hostname.replace(/^www\./, ""),
      reason: cred,
    };
  }

  if (isBlockedListingHost(parsed.hostname)) {
    return {
      rawUrl: trimmed,
      canonicalUrl: canonicalizeListingUrl(trimmed),
      bucket: "unsupported_or_unsafe",
      hostname: parsed.hostname.replace(/^www\./, ""),
      reason: "blocked social/non-dealer host",
    };
  }

  // Respect repo Penske/TruckPaper restrictions for automated discovery retention
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  if (host.endsWith("truckpaper.com") && /\/listings\b/i.test(path)) {
    return {
      rawUrl: trimmed,
      canonicalUrl: canonicalizeListingUrl(trimmed),
      bucket: "unsupported_or_unsafe",
      hostname: host,
      reason: "TruckPaper /listings paths are not retained by current URL gate",
    };
  }

  if (isIndividualListingUrl(trimmed)) {
    return {
      rawUrl: trimmed,
      canonicalUrl: canonicalizeListingUrl(trimmed),
      bucket: "individual_listing",
      hostname: host,
      reason: "passes isIndividualListingUrl",
    };
  }

  // Likely listing: has unit-ish path but failed the strict gate (needs inspection)
  const segments = path.split("/").filter(Boolean);
  const looksUnitish =
    /used-|for-sale|inventory|listing|detail|vdp|stock|unit|\d{5,}/i.test(path) ||
    (segments.length >= 2 && /[a-z]{2,}-\d{2,}/i.test(segments[segments.length - 1] || ""));
  if (looksUnitish && !HUB_PATH_RE.test(path) && path !== "/") {
    return {
      rawUrl: trimmed,
      canonicalUrl: canonicalizeListingUrl(trimmed),
      bucket: "likely_listing_needs_inspection",
      hostname: host,
      reason: "unit-shaped path; needs page inspection before confirm",
    };
  }

  if (HUB_PATH_RE.test(path) || path === "/" || /\/search\b/i.test(path)) {
    return {
      rawUrl: trimmed,
      canonicalUrl: canonicalizeListingUrl(trimmed),
      bucket: "hub_or_category",
      hostname: host,
      reason: "category/search/hub page",
    };
  }

  return {
    rawUrl: trimmed,
    canonicalUrl: canonicalizeListingUrl(trimmed),
    bucket: "hub_or_category",
    hostname: host,
    reason: "not an individual listing URL",
  };
}
