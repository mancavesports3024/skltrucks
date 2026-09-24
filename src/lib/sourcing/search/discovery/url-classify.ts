/**
 * Discovery-time URL classification (shared by production Preview + benchmark).
 *
 * `individual_listing` requires positive unit-level VDP evidence.
 * Known category/search/noise shapes are hubs or unsupported.
 * Uncertain unit-shaped paths are `likely_listing_needs_inspection`.
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

const DEALERCENTER_SEO_RE = /-for-sale-i\d+c\d+f\d+m\d+/i;

const PLURAL_CATEGORY_LEAF_RE =
  /^(box-trucks?(?:-for-sale)?|trucks-for-sale|delivery-moving-straight-box-trucks-for-sale|all-for-sale|work-trucks-for-sale|box-van-trucks?)$/i;

const NOISE_HOST_SUFFIXES = [
  "justanswer.com",
  "cumminsforum.com",
  "dieseltruckresource.com",
  "expeditionportal.com",
  "autohelperbot.com",
  "epicvin.com",
  "truckradar.ai",
] as const;

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

function isNoiseHost(host: string): boolean {
  return NOISE_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

export function detectDiscoveryHub(host: string, path: string, search: string): string | null {
  const leaf = path.split("/").filter(Boolean).pop() || "";

  if (isNoiseHost(host)) {
    return "Q&A / forum / VIN-history / market-summary noise host";
  }

  if (/\.(pdf|docx?|xlsx?|zip|csv)(\?|$)/i.test(path)) {
    return "non-HTML document path";
  }

  if (DEALERCENTER_SEO_RE.test(path) || DEALERCENTER_SEO_RE.test(leaf)) {
    return "DealerCenter-style category SEO inventory path";
  }

  if (host === "soarr.com" || host.endsWith(".soarr.com")) {
    if (
      /\/(box-trucks-for-sale|all-for-sale)(?:-in-[a-z-]+)?\/?$/i.test(path) ||
      /\/for-sale\/trucks\/\d+\/[^/]+\/[^/]+\/(box-trucks-for-sale|all-for-sale)/i.test(path)
    ) {
      return "SOARR filtered/model/geo search path";
    }
  }

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

  if (/\/(auction-results|auction\/results)\b/i.test(path)) {
    return "auction-results index (not an individual lot)";
  }

  if (
    host.endsWith("tractorhouse.com") ||
    host.endsWith("truckpaper.com") ||
    host.endsWith("machinerytrader.com")
  ) {
    if (/\/listings\b/i.test(path) && !/\/lot-details\b/i.test(path)) {
      return "marketplace /listings search or category path";
    }
  }

  if (
    /box-trucks?-for-sale-in-[a-z-]+/i.test(path) ||
    /\/hp\/box-trucks?-for-sale/i.test(path) ||
    /\/market\/\d{4}-/i.test(path)
  ) {
    return "geographic or market-summary inventory index";
  }

  if (PLURAL_CATEGORY_LEAF_RE.test(leaf) || /\/box-truck\/?$/i.test(path)) {
    return "generic box-truck / inventory category path";
  }

  if (
    /\/trucks-for-sale\/[^/]+\/[a-z][a-z0-9-]+\/?$/i.test(path) &&
    !/\d{5,}/.test(path) &&
    !/\/(unit|stock|listing|vdp)[-_]?\d+/i.test(path)
  ) {
    return "make/model inventory index";
  }

  if (/\/work-trucks-for-sale\/box-trucks-for-sale\/?$/i.test(path)) {
    return "dealer work-truck category index";
  }

  if (
    (host === "comvoy.com" || host.endsWith(".comvoy.com")) &&
    /\/vehicles\/[a-z0-9-]+\/[a-z0-9-]+\/?$/i.test(path) &&
    !/\d{5,}/.test(path)
  ) {
    return "Comvoy model-family path";
  }

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

export function detectPositiveUnitEvidence(
  host: string,
  path: string
): { ok: true; reason: string } | { ok: false; reason: string } {
  const leaf = path.split("/").filter(Boolean).pop() || "";

  if (
    (host === "penskeusedtrucks.com" || host.endsWith(".penskeusedtrucks.com")) &&
    /\/unit-\d{4,}\/?$/i.test(path)
  ) {
    return { ok: true, reason: "Penske /unit-{id} VDP pattern" };
  }

  if (/\/lot-details\/[a-z0-9-]+/i.test(path)) {
    return { ok: true, reason: "auction lot-details unit page" };
  }

  if (host.endsWith("commercialtrucktrader.com")) {
    if (/\/listing\//i.test(path) && /\d{6,}/.test(path)) {
      return { ok: true, reason: "CTT /listing/…/{id} VDP pattern" };
    }
    if (
      !/trucks-for-sale\/?$/i.test(path) &&
      !/\/(search|results)\b/i.test(path) &&
      /(?:\/|-)\d{6,}(?:\/|$)/i.test(path)
    ) {
      return { ok: true, reason: "CTT numeric listing id in path" };
    }
  }

  if (/\/inventory\/used-\d{4}-[a-z0-9-]+-\d{3,}\/?$/i.test(path)) {
    return { ok: true, reason: "inventory used-{year}-…-{id} VDP slug" };
  }

  if (/\/inventory\/used-\d{4}-[a-z0-9-]+-[a-hj-npr-z0-9]{17}(?:-in-[a-z-]+)?\/?$/i.test(path)) {
    return { ok: true, reason: "inventory used-{year}-…-{vin} VDP slug" };
  }

  if (/\/inventory\//i.test(path) && /^\d{5,}$/.test(leaf)) {
    return { ok: true, reason: "inventory numeric listing id leaf" };
  }

  if (/^(unit|stock|listing|vdp)[-_]?\d{4,}$/i.test(leaf)) {
    return { ok: true, reason: "unit/stock/listing id leaf" };
  }

  if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(leaf)) {
    return { ok: true, reason: "VIN-shaped leaf" };
  }

  if (/\/for-sale\/\d{4}-[a-z0-9-]+-\d{5,}\/?$/i.test(path)) {
    return { ok: true, reason: "for-sale unit slug with listing id" };
  }

  if (/\/listings\/\d{5,}-[a-z0-9-]+/i.test(path)) {
    return { ok: true, reason: "listings/{id}-… unit path" };
  }

  if (/\/work-truck\/(?:[^/]+\/)?\d{4}-[a-z0-9-]+-\d{5,}\/?$/i.test(path)) {
    return { ok: true, reason: "work-truck unit path with listing id" };
  }

  if (/\/(detail|vdp|listing)\//i.test(path) && (/\d{5,}/.test(leaf) || /^\d{5,}$/.test(leaf))) {
    return { ok: true, reason: "detail/vdp/listing path with numeric id" };
  }

  return { ok: false, reason: "no positive unit-level VDP evidence" };
}

function looksAmbiguousUnitPath(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  const leaf = segments[segments.length - 1] || "";
  if (/used-\d{4}-/i.test(leaf) || /\/inventory\//i.test(path)) return true;
  if (/\/(listing|detail|vdp|unit|stock|for-sale|work-truck|lot-details)\b/i.test(path)) return true;
  if (/\d{5,}/.test(path)) return true;
  if (/[a-z]{2,}-\d{2,}/i.test(leaf)) return true;
  return false;
}

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

export const DISCOVERY_NOISE_HOST_SUFFIXES = NOISE_HOST_SUFFIXES;
