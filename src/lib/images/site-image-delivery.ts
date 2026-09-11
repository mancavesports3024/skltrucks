/** Widths used for responsive homepage/site imagery (mobile-first). */
export const SITE_IMAGE_SRC_WIDTHS = [640, 828, 1080, 1600, 1920] as const;

export type SiteImageSrcWidth = (typeof SITE_IMAGE_SRC_WIDTHS)[number];

const DEFAULT_MEDIA_ENDPOINT = "/api/site-image";

function isAllowedSupabasePublicObjectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!parsed.hostname.endsWith(".supabase.co")) return false;
    return parsed.pathname.includes("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

/**
 * True when we can safely proxy/resize this URL through our site-image endpoint.
 * Local/public paths and non-Supabase hosts are left unchanged.
 */
export function canDeliverViaSiteImageApi(src: string): boolean {
  if (!src || src.startsWith("/") || src.startsWith("data:")) return false;
  return isAllowedSupabasePublicObjectUrl(src);
}

export function buildSiteImageDeliveryUrl(
  src: string,
  width: SiteImageSrcWidth | number,
  options?: { endpoint?: string; quality?: number }
): string {
  if (!canDeliverViaSiteImageApi(src)) return src;
  const endpoint = options?.endpoint ?? DEFAULT_MEDIA_ENDPOINT;
  const quality = options?.quality ?? 75;
  const params = new URLSearchParams({
    url: src,
    w: String(width),
    q: String(quality),
  });
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
