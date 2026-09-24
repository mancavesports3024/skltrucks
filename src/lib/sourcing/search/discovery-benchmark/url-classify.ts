/**
 * Discovery-time URL classification for the read-only Tavily benchmark.
 *
 * `individual_listing` requires positive unit-level VDP evidence.
 * Known category/search shapes (DealerCenter SEO, SOARR filters, eBay browse,
 * TractorHouse /listings, generic inventory indexes) are hubs.
 * Uncertain unit-shaped paths are `likely_listing_needs_inspection`.
 *
 * Does NOT claim a truck matches — discovery only finds plausible URLs.
 */
import { canonicalizeListingUrl } from "@/lib/sourcing/duplicates";
import { isBlockedListingHost } from "@/lib/sourcing/search/map-candidates";

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

/** DealerCenter-style category SEO: …-for-sale-i2c44f0m0 */
const DEALERCENTER_SEO_RE = /-for-sale-i\d+c\d+f\d+m\d+/i;

/** Plural / collection path leaves that are never a single VDP. */
const PLURAL_CATEGORY_LEAF_RE =
  /^(box-trucks?(?:-for-sale)?|trucks-for-sale|delivery-moving-straight-box-trucks-for-sale|all-for-sale|work-trucks-for-sale|box-van-trucks?)$/i;

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

function hostOf(hostname: string): string {
  return hostname.replace(/^www\./, "").toLowerCase();
}

/**
 * Host-aware + path-shape hub detection for false positives from live run 1.
 * Returns a staff-safe reason when the URL is a category/search/collection page.
 */
export function detectDiscoveryHub(host: string, path: string, search: string): string | null {
  const leaf = path.split("/").filter(Boolean).pop() || "";

  // DealerCenter-style SEO inventory filters (category, not unit)
  if (DEALERCENTER_SEO_RE.test(path) || DEALERCENTER_SEO_RE.test(leaf)) {
    return "DealerCenter-style category SEO inventory path";
  }

  // SOARR filtered / model / geo search pages
  if (host === "soarr.com" || host.endsWith(".soarr.com")) {
    if (
      /\/(box-trucks-for-sale|all-for-sale)(?:-in-[a-z-]+)?\/?$/i.test(path) ||
      /\/for-sale\/trucks\/\d+\/[^/]+\/[^/]+\/(box-trucks-for-sale|all-for-sale)/i.test(path)
    ) {
      return "SOARR filtered/model/geo search path";
    }
  }

  // eBay browse nodes, shops, and keyword search
  if (host === "ebay.com" || host.endsWith(".ebay.com")) {
    if (
      /^\/b\//i.test(path) ||
      /^\/shop\//i.test(path) ||
      /^\/sch\//i.test(path) ||
      search.includes("_nkw=") ||
      search.includes("nkw=")
    ) {
      return "eBay browse/search path";
    }
  }

  // TractorHouse / TruckPaper / MachineryTrader listing search hubs
  if (
    host.endsWith("tractorhouse.com") ||
    host.endsWith("truckpaper.com") ||
    host.endsWith("machinerytrader.com")
  ) {
    if (/\/listings\b/i.test(path)) {
      return "marketplace /listings search or category path";
    }
  }

  // Geographic / landing inventory indexes
  if (
    /box-trucks?-for-sale-in-[a-z-]+/i.test(path) ||
    /\/hp\/box-trucks?-for-sale/i.test(path)
  ) {
    return "geographic or landing inventory index";
  }

  // Generic plural category / inventory filter leaves
  if (PLURAL_CATEGORY_LEAF_RE.test(leaf) || /\/box-truck\/?$/i.test(path)) {
    return "generic box-truck / inventory category path";
  }

  // Make/model inventory indexes without a unit id:
  // /trucks-for-sale/box-van-truck/freightliner
  // /trucks-for-sale/box-truck/international
  if (
    /\/trucks-for-sale\/[^/]+\/[a-z][a-z0-9-]+\/?$/i.test(path) &&
    !/\d{5,}/.test(path) &&
    !/\/(unit|stock|listing|vdp)[-_]?\d+/i.test(path)
  ) {
    return "make/model inventory index";
  }

  // Work-truck category trees ending in plural sale pages
  if (/\/work-trucks-for-sale\/box-trucks-for-sale\/?$/i.test(path)) {
    return "dealer work-truck category index";
  }

  // Comvoy model-family pages (e.g. /vehicles/international/mv-16j5) — not unit VDPs
  if (
    (host === "comvoy.com" || host.endsWith(".comvoy.com")) &&
    /\/vehicles\/[a-z0-9-]+\/[a-z0-9-]+\/?$/i.test(path) &&
    !/\d{5,}/.test(path)
  ) {
    return "Comvoy model-family path";
  }

  // Trailing search/results/category segment
  if (
    /\/(search|search-inventory|results|category|categories|for-sale|trucks-for-sale|shop|used|inventory)\/?$/i.test(
      path
    )
  ) {
    return "category/search/hub page";
  }

  if (path === "/" || /\/search\b/i.test(path)) {
    return "category/search/hub page";
  }

  return null;
}

/**
 * Positive unit-level VDP evidence required for `individual_listing`.
 * Prefer host-specific patterns and unique listing/unit/stock/VIN identifiers.
 */
export function detectPositiveUnitEvidence(
  host: string,
  path: string
): { ok: true; reason: string } | { ok: false; reason: string } {
  const leaf = path.split("/").filter(Boolean).pop() || "";

  // Penske public unit pages
  if (
    (host === "penskeusedtrucks.com" || host.endsWith(".penskeusedtrucks.com")) &&
    /\/unit-\d{4,}\/?$/i.test(path)
  ) {
    return { ok: true, reason: "Penske /unit-{id} VDP pattern" };
  }

  // Commercial Truck Trader numeric listing id
  if (host.endsWith("commercialtrucktrader.com")) {
    if (/\/listing\//i.test(path) && /\d{6,}/.test(path)) {
      return { ok: true, reason: "CTT /listing/…/{id} VDP pattern" };
    }
    // Listing SEO leaves often end with a large numeric id (not category /trucks-for-sale)
    if (
      !/trucks-for-sale\/?$/i.test(path) &&
      !/\/(search|results)\b/i.test(path) &&
      /(?:\/|-)\d{6,}(?:\/|$)/i.test(path)
    ) {
      return { ok: true, reason: "CTT numeric listing id in path" };
    }
  }

  // MyLittleSalesman / dealer inventory used-{year}-…-{stockId}
  if (/\/inventory\/used-\d{4}-[a-z0-9-]+-\d{3,}\/?$/i.test(path)) {
    return { ok: true, reason: "inventory used-{year}-…-{id} VDP slug" };
  }

  // /inventory/…/{numericId}
  if (/\/inventory\//i.test(path) && /^\d{5,}$/.test(leaf)) {
    return { ok: true, reason: "inventory numeric listing id leaf" };
  }

  // Explicit unit/stock/listing/vdp id leaf
  if (/^(unit|stock|listing|vdp)[-_]?\d{4,}$/i.test(leaf)) {
    return { ok: true, reason: "unit/stock/listing id leaf" };
  }

  // VIN-shaped leaf (17 I/O/Q excluded chars)
  if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(leaf)) {
    return { ok: true, reason: "VIN-shaped leaf" };
  }

  // /detail/ or /vdp/ with trailing numeric id
  if (/\/(detail|vdp|listing)\//i.test(path) && (/\d{5,}/.test(leaf) || /^\d{5,}$/.test(leaf))) {
    return { ok: true, reason: "detail/vdp/listing path with numeric id" };
  }

  return { ok: false, reason: "no positive unit-level VDP evidence" };
}

function looksAmbiguousUnitPath(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  const leaf = segments[segments.length - 1] || "";
  // Year + vehicle words without a clear stock id → inspect, do not confirm as individual
  if (/used-\d{4}-/i.test(leaf) || /\/inventory\//i.test(path)) return true;
  if (/\/(listing|detail|vdp|unit|stock)\b/i.test(path)) return true;
  if (/\d{5,}/.test(path)) return true;
  if (/[a-z]{2,}-\d{2,}/i.test(leaf)) return true;
  return false;
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
      hostname: hostOf(parsed.hostname),
      reason: "URL userinfo is not allowed",
    };
  }

  if (parsed.hash && parsed.hash.length > 1) {
    return {
      rawUrl: trimmed,
      canonicalUrl: "",
      bucket: "unsupported_or_unsafe",
      hostname: hostOf(parsed.hostname),
      reason: "URL fragment is not allowed",
    };
  }

  const cred = hasCredentialLikeQuery(parsed);
  if (cred) {
    return {
      rawUrl: trimmed,
      canonicalUrl: "",
      bucket: "unsupported_or_unsafe",
      hostname: hostOf(parsed.hostname),
      reason: cred,
    };
  }

  if (isBlockedListingHost(parsed.hostname)) {
    return {
      rawUrl: trimmed,
      canonicalUrl: canonicalizeListingUrl(trimmed),
      bucket: "unsupported_or_unsafe",
      hostname: hostOf(parsed.hostname),
      reason: "blocked social/non-dealer host",
    };
  }

  const host = hostOf(parsed.hostname);
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  const search = parsed.search || "";

  // TruckPaper /listings — existing automated discovery restriction
  if (host.endsWith("truckpaper.com") && /\/listings\b/i.test(path)) {
    return {
      rawUrl: trimmed,
      canonicalUrl: canonicalizeListingUrl(trimmed),
      bucket: "unsupported_or_unsafe",
      hostname: host,
      reason: "TruckPaper /listings paths are not retained by current URL gate",
    };
  }

  const hubReason = detectDiscoveryHub(host, path, search);
  if (hubReason) {
    return {
      rawUrl: trimmed,
      canonicalUrl: canonicalizeListingUrl(trimmed),
      bucket: "hub_or_category",
      hostname: host,
      reason: hubReason,
    };
  }

  const unit = detectPositiveUnitEvidence(host, path);
  if (unit.ok) {
    return {
      rawUrl: trimmed,
      canonicalUrl: canonicalizeListingUrl(trimmed),
      bucket: "individual_listing",
      hostname: host,
      reason: unit.reason,
    };
  }

  if (looksAmbiguousUnitPath(path)) {
    return {
      rawUrl: trimmed,
      canonicalUrl: canonicalizeListingUrl(trimmed),
      bucket: "likely_listing_needs_inspection",
      hostname: host,
      reason: "unit-shaped path without proven VDP signature; needs inspection",
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
