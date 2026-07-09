import fs from "fs";
import path from "path";
import {
  LEGACY_PAGE_REDIRECTS,
  LEGACY_PRODUCT_CATEGORIES,
  resolveProductCategoryRedirect,
} from "./category-redirects";

export { resolveProductCategoryRedirect } from "./category-redirects";

export interface RedirectEntry {
  source: string;
  destination: string;
  permanent: boolean;
}

function withTrailingSlash(source: string): RedirectEntry {
  return {
    source: source.endsWith("/") ? source : `${source}/`,
    destination: source.endsWith("/") ? source.slice(0, -1) : source,
    permanent: true,
  };
}

function loadProductSlugs(): string[] {
  const candidates = [
    path.join(process.cwd(), "..", "products.json"),
    path.join(process.cwd(), "products.json"),
  ];

  for (const jsonPath of candidates) {
    if (!fs.existsSync(jsonPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { slug?: string }[];
      if (Array.isArray(raw)) {
        return raw.map((p) => p.slug).filter((slug): slug is string => Boolean(slug));
      }
    } catch {
      // fall through
    }
  }

  return [];
}

export function buildWordPressRedirects(): RedirectEntry[] {
  const redirects: RedirectEntry[] = [];
  const seen = new Set<string>();

  function add(entry: RedirectEntry) {
    const key = `${entry.source}->${entry.destination}`;
    if (seen.has(key)) return;
    seen.add(key);
    redirects.push(entry);
  }

  for (const page of [
    "/",
    "/shop",
    "/financing",
    "/contact-us",
    "/services",
    "/sell-my-truck",
    "/truck-financing",
    "/truck-sales",
  ]) {
    if (page === "/") {
      add({ source: "/index.html", destination: "/", permanent: true });
      continue;
    }
    add(withTrailingSlash(page));
  }

  for (const [slug, destination] of Object.entries(LEGACY_PAGE_REDIRECTS)) {
    add({ source: `/${slug}`, destination, permanent: true });
    add(withTrailingSlash(`/${slug}`));
  }

  for (const slug of LEGACY_PRODUCT_CATEGORIES) {
    const destination = resolveProductCategoryRedirect(slug);
    add({ source: `/product-category/${slug}`, destination, permanent: true });
    add(withTrailingSlash(`/product-category/${slug}`));
  }

  for (const slug of loadProductSlugs()) {
    add({
      source: `/product/${slug}/`,
      destination: `/product/${slug}`,
      permanent: true,
    });
  }

  return redirects;
}
