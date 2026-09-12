/** Widths used for responsive homepage/site imagery (mobile-first). */
export const SITE_IMAGE_SRC_WIDTHS = [640, 828, 1080, 1600, 1920] as const;

export type SiteImageSrcWidth = (typeof SITE_IMAGE_SRC_WIDTHS)[number];

export const SITE_IMAGE_BUCKET = "site-images";
export const SITE_IMAGE_PUBLIC_PREFIX = `/storage/v1/object/public/${SITE_IMAGE_BUCKET}/`;

/** Fallback when NEXT_PUBLIC_SUPABASE_URL is unset (matches this project's host). */
export const FALLBACK_SUPABASE_HOSTNAME = "kgnhisdckorctefbggwo.supabase.co";

const DEFAULT_MEDIA_ENDPOINT = "/api/site-image";

export type SiteImageUrlRejectionReason =
  | "empty"
  | "malformed"
  | "protocol"
  | "credentials"
  | "port"
  | "hostname"
  | "hash"
  | "query"
  | "prefix"
  | "traversal"
  | "empty_object";

export type SiteImageUrlParseResult =
  | { ok: true; url: URL; normalized: string }
  | { ok: false; reason: SiteImageUrlRejectionReason };

export function getApprovedSupabaseHostname(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (fromEnv) {
    try {
      const host = new URL(fromEnv).hostname.toLowerCase();
      if (host.endsWith(".supabase.co") && !host.includes("/")) {
        return host;
      }
    } catch {
      // fall through to project fallback
    }
  }
  return FALLBACK_SUPABASE_HOSTNAME;
}

function containsTraversal(value: string): boolean {
  const lower = value.toLowerCase();
  // Reject any encoded dots/slashes/backslashes before URL normalization can hide them.
  if (lower.includes("%2e") || lower.includes("%2f") || lower.includes("%5c")) return true;
  if (lower.includes("\\") || lower.includes("/../") || lower.endsWith("/..")) return true;
  if (/(^|\/)\.\.(\/|$)/.test(lower)) return true;
  if (lower.split("/").some((segment) => segment === "..")) return true;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.includes("\\")) return true;
    if (/(^|\/)\.\.(\/|$)/.test(decoded)) return true;
    if (decoded.split("/").some((segment) => segment === "..")) return true;
  } catch {
    return true;
  }
  return false;
}

/**
 * Strict allowlist parser for public site-images objects.
 * Rejects credentials, ports, wrong hosts, traversal, and non-site-images paths.
 */
export function parseApprovedSiteImageUrl(raw: string): SiteImageUrlParseResult {
  if (!raw || typeof raw !== "string") return { ok: false, reason: "empty" };

  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  // Inspect the raw string first — WHATWG URL parsing can normalize %2e%2e away.
  if (containsTraversal(trimmed)) return { ok: false, reason: "traversal" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (parsed.protocol !== "https:") return { ok: false, reason: "protocol" };
  if (parsed.username || parsed.password) return { ok: false, reason: "credentials" };
  if (parsed.port) return { ok: false, reason: "port" };
  if (parsed.hash) return { ok: false, reason: "hash" };
  if (parsed.search) return { ok: false, reason: "query" };

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== getApprovedSupabaseHostname()) {
    return { ok: false, reason: "hostname" };
  }

  // Normalize pathname (URL keeps percent-encoding). Require exact public prefix.
  const pathname = parsed.pathname;
  if (!pathname.startsWith(SITE_IMAGE_PUBLIC_PREFIX)) {
    return { ok: false, reason: "prefix" };
  }

  const objectPath = pathname.slice(SITE_IMAGE_PUBLIC_PREFIX.length);
  if (!objectPath) return { ok: false, reason: "empty_object" };
  if (containsTraversal(pathname) || containsTraversal(objectPath)) {
    return { ok: false, reason: "traversal" };
  }

  // Rebuild a canonical URL so cache keys stay stable for identical inputs.
  const normalized = `https://${hostname}${pathname}`;
  return { ok: true, url: new URL(normalized), normalized };
}

/**
 * True when we can safely proxy/resize this URL through our site-image endpoint.
 * Local/public paths and non-approved hosts are left unchanged by callers.
 */
export function canDeliverViaSiteImageApi(src: string): boolean {
  if (!src || src.startsWith("/") || src.startsWith("data:")) return false;
  return parseApprovedSiteImageUrl(src).ok;
}

export function buildSiteImageDeliveryUrl(
  src: string,
  width: SiteImageSrcWidth | number,
  options?: { endpoint?: string; quality?: number }
): string {
  const parsed = parseApprovedSiteImageUrl(src);
  if (!parsed.ok) return src;
  const endpoint = options?.endpoint ?? DEFAULT_MEDIA_ENDPOINT;
  const quality = options?.quality ?? 75;
  // Stable param order (url, w, q) for identical CDN cache keys.
  const params = new URLSearchParams();
  params.set("url", parsed.normalized);
  params.set("w", String(width));
  params.set("q", String(quality));
  return `${endpoint}?${params.toString()}`;
}

export function buildSiteImageSrcSet(
  src: string,
  options?: { endpoint?: string; quality?: number; widths?: readonly number[] }
): string | undefined {
  if (!canDeliverViaSiteImageApi(src)) return undefined;
  const widths = options?.widths ?? SITE_IMAGE_SRC_WIDTHS;
  return widths
    .map((width) => `${buildSiteImageDeliveryUrl(src, width, options)} ${width}w`)
    .join(", ");
}

/** Default sizes for full-bleed homepage hero. */
export const HERO_IMAGE_SIZES = "100vw";
