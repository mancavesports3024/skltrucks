/**
 * Canonical public site URL for sitemap, robots, and metadata.
 *
 * Production should set NEXT_PUBLIC_SITE_URL=https://www.skltrucks.com
 * (Vercel → Project → Settings → Environment Variables). Apex
 * https://skltrucks.com remains a permanent 308 → www and must not serve HTML.
 *
 * Canonical/public URLs must never derive from VERCEL_URL (preview hostnames).
 * With no NEXT_PUBLIC_SITE_URL, the stable fallback is always PRODUCTION_SITE_URL.
 */

export const PRODUCTION_SITE_URL = "https://www.skltrucks.com";

/** Strip trailing slashes; origin only. Bare apex host maps to www. */
export function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return PRODUCTION_SITE_URL;

  let withProtocol = trimmed;
  if (!/^https?:\/\//i.test(withProtocol)) {
    withProtocol = `https://${withProtocol}`;
  }

  const url = new URL(withProtocol);
  if (url.hostname === "skltrucks.com") {
    return PRODUCTION_SITE_URL;
  }
  return url.origin;
}

export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return normalizeSiteUrl(fromEnv);

  // Never use VERCEL_URL here — preview hosts must not become public canonicals.
  return PRODUCTION_SITE_URL;
}

export function getMetadataBase(): URL {
  return new URL(`${getSiteUrl()}/`);
}

/** Normalize to `/` or `/path` without a trailing slash (except home). */
export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  const withSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

/**
 * Absolute public URL for a pathname.
 * Home is `https://www.skltrucks.com/` (trailing slash).
 * Other routes omit a trailing slash: `https://www.skltrucks.com/shop`.
 */
export function absoluteUrl(pathname = "/"): string {
  const base = getSiteUrl();
  const path = normalizePathname(pathname);
  if (path === "/") return `${base}/`;
  return `${base}${path}`;
}
