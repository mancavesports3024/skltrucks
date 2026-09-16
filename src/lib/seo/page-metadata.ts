import type { Metadata } from "next";
import { absoluteUrl, normalizePathname } from "@/lib/seo/site-url";

/**
 * Self-referencing canonical + Open Graph URL for an indexable public route.
 * Pass the page pathname (e.g. `/`, `/shop`, `/product/some-slug`) — never hardcode
 * the homepage path for other routes.
 *
 * Does not emit `twitter:url` — Twitter Cards have no supported url field in Next.js
 * Metadata, and a custom meta tag is not a reliable crawler signal.
 */
export function indexablePageMetadata(
  pathname: string,
  extras: Metadata = {}
): Metadata {
  const path = normalizePathname(pathname);
  const canonicalUrl = absoluteUrl(path);
  const priorOg =
    extras.openGraph && typeof extras.openGraph === "object" && !Array.isArray(extras.openGraph)
      ? extras.openGraph
      : {};

  return {
    ...extras,
    alternates: {
      ...extras.alternates,
      // Absolute www URL so paths never inherit the homepage canonical.
      canonical: canonicalUrl,
    },
    openGraph: {
      ...priorOg,
      url: canonicalUrl,
    },
  };
}
