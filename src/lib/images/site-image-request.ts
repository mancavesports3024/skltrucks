import { SITE_IMAGE_SRC_WIDTHS } from "@/lib/images/site-image-delivery";

export const SITE_IMAGE_MIN_QUALITY = 50;
export const SITE_IMAGE_MAX_QUALITY = 80;
export const SITE_IMAGE_DEFAULT_QUALITY = 75;

const ALLOWED_WIDTHS = new Set<number>(SITE_IMAGE_SRC_WIDTHS);

export function parseSiteImageWidthParam(raw: string | null): number | null {
  if (raw == null || raw === "" || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!ALLOWED_WIDTHS.has(value)) return null;
  return value;
}

export function parseSiteImageQualityParam(raw: string | null): number | null {
  if (raw == null || raw === "") return SITE_IMAGE_DEFAULT_QUALITY;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isInteger(value)) return null;
  if (value < SITE_IMAGE_MIN_QUALITY || value > SITE_IMAGE_MAX_QUALITY) return null;
  return value;
}

export function normalizeImageContentType(value: string | null): string | null {
  if (!value) return null;
  return value.split(";")[0]?.trim().toLowerCase() || null;
}

export const ALLOWED_SITE_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
