import { CAB_TYPES, MANUFACTURERS } from "../constants";

const MANUFACTURER_SLUGS = MANUFACTURERS.map((m) => m.slug);
const CAB_SLUGS = CAB_TYPES.map((c) => c.slug);

/** Old WordPress page slugs at skltrucks.com/{slug}/ → new routes */
export const LEGACY_PAGE_REDIRECTS: Record<string, string> = {
  inventory: "/shop",
  "browse-all": "/shop",
  "sleeper-trucks": "/shop?category=sleeper-trucks",
  "day-cab-trucks": "/shop?category=day-cabs",
  "delivery-moving-straight-box-trucks":
    "/shop?category=delivery-moving-straight-refrigerated-box-trucks",
  freightliner: "/shop?manufacturer=freightliner",
  international: "/shop?manufacturer=international",
  kenworth: "/shop?manufacturer=kenworth",
  volvo: "/shop?manufacturer=volvo",
  peterbilt: "/shop?manufacturer=peterbilt",
  hino: "/shop?manufacturer=hino",
  isuzu: "/shop?manufacturer=isuzu",
  mack: "/shop?manufacturer=mack",
  "service-details": "/services",
  cart: "/shop",
  checkout: "/shop",
  "my-account": "/shop",
  "sample-page": "/",
};

/** WooCommerce product-category slugs from the live site */
export const LEGACY_PRODUCT_CATEGORIES = [
  "day-cabs",
  "delivery-moving-straight-refrigerated-box-trucks",
  "freightliner-delivery-moving-straight-refrigerated-box-trucks",
  "international",
  "international-sleeper-trucks",
  "international-delivery-moving-straight-refrigerated-box-trucks",
  "sleeper-trucks",
];

export function resolveProductCategoryRedirect(slug: string): string {
  const normalized = slug.replace(/\/$/, "").toLowerCase();
  if (!normalized) return "/shop";

  if (CAB_SLUGS.includes(normalized)) {
    return `/shop?category=${normalized}`;
  }

  if (MANUFACTURER_SLUGS.includes(normalized)) {
    return `/shop?manufacturer=${normalized}`;
  }

  for (const mfg of MANUFACTURER_SLUGS) {
    const prefix = `${mfg}-`;
    if (normalized.startsWith(prefix)) {
      const cabPart = normalized.slice(prefix.length);
      if (CAB_SLUGS.includes(cabPart)) {
        return `/shop?manufacturer=${mfg}&category=${cabPart}`;
      }
    }
  }

  return "/shop";
}
