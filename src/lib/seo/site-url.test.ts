import { afterEach, describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { indexablePageMetadata } from "@/lib/seo/page-metadata";
import {
  PRODUCTION_SITE_URL,
  absoluteUrl,
  getMetadataBase,
  getSiteUrl,
  normalizePathname,
  normalizeSiteUrl,
} from "@/lib/seo/site-url";

describe("normalizeSiteUrl / getSiteUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
  });

  it("defaults public fallback to www (not apex, not preview host)", () => {
    process.env.VERCEL_URL = "skltrucks-git-feature-team.vercel.app";
    process.env.VERCEL_ENV = "preview";
    expect(getSiteUrl()).toBe(PRODUCTION_SITE_URL);
    expect(getSiteUrl()).toBe("https://www.skltrucks.com");
    expect(getSiteUrl()).not.toBe("https://skltrucks.com");
    expect(getSiteUrl()).not.toContain("vercel.app");
  });

  it("normalizes trailing slashes and avoids double slashes", () => {
    expect(normalizeSiteUrl("https://www.skltrucks.com/")).toBe(
      "https://www.skltrucks.com"
    );
    expect(normalizeSiteUrl("https://www.skltrucks.com///")).toBe(
      "https://www.skltrucks.com"
    );
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.skltrucks.com/";
    expect(getSiteUrl()).toBe("https://www.skltrucks.com");
    expect(absoluteUrl("/shop")).toBe("https://www.skltrucks.com/shop");
    expect(absoluteUrl("/")).toBe("https://www.skltrucks.com/");
  });

  it("maps accidental apex NEXT_PUBLIC_SITE_URL to www", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://skltrucks.com/";
    expect(getSiteUrl()).toBe("https://www.skltrucks.com");
  });

  it("uses NEXT_PUBLIC_SITE_URL when set to www", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.skltrucks.com";
    expect(getSiteUrl()).toBe("https://www.skltrucks.com");
  });

  it("ignores VERCEL_URL even on production env if SITE_URL unset", () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "skltrucks-abc123.vercel.app";
    expect(getSiteUrl()).toBe("https://www.skltrucks.com");
  });
});

describe("absoluteUrl / pathnames", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("homepage absolute URL keeps a trailing slash", () => {
    expect(absoluteUrl("/")).toBe("https://www.skltrucks.com/");
    expect(normalizePathname("/")).toBe("/");
  });

  it("static and product paths stay path-specific (not homepage)", () => {
    expect(absoluteUrl("/shop")).toBe("https://www.skltrucks.com/shop");
    expect(absoluteUrl("/contact-us")).toBe("https://www.skltrucks.com/contact-us");
    expect(absoluteUrl("/product/demo-truck")).toBe(
      "https://www.skltrucks.com/product/demo-truck"
    );
  });
});

describe("indexablePageMetadata", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("homepage canonical is https://www.skltrucks.com/", () => {
    const meta = indexablePageMetadata("/");
    expect(meta.alternates?.canonical).toBe("https://www.skltrucks.com/");
    expect(meta.openGraph && "url" in meta.openGraph ? meta.openGraph.url : null).toBe(
      "https://www.skltrucks.com/"
    );
    expect(meta.other?.["twitter:url"]).toBeUndefined();
  });

  it("static routes canonicalize to their own www paths", () => {
    for (const path of ["/shop", "/contact-us", "/financing", "/services"]) {
      const meta = indexablePageMetadata(path, { title: path });
      expect(meta.alternates?.canonical).toBe(`https://www.skltrucks.com${path}`);
      expect(meta.openGraph && "url" in meta.openGraph ? meta.openGraph.url : null).toBe(
        `https://www.skltrucks.com${path}`
      );
      expect(meta.alternates?.canonical).not.toBe("https://www.skltrucks.com/");
      expect(meta.other?.["twitter:url"]).toBeUndefined();
    }
  });

  it("product/dynamic routes canonicalize to their own path (slug only, no query)", () => {
    const slug = "2018-freightliner-m2-3alacwfc4jdjl7861";
    const path = `/product/${slug}`;
    const meta = indexablePageMetadata(path, { title: "Truck" });
    expect(meta.alternates?.canonical).toBe(`https://www.skltrucks.com${path}`);
    expect(meta.openGraph && "url" in meta.openGraph ? meta.openGraph.url : null).toBe(
      `https://www.skltrucks.com${path}`
    );
    expect(String(meta.alternates?.canonical)).not.toContain("?");
  });
});

describe("robots + sitemap www alignment", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
  });

  it("robots host and sitemap URL use www even if VERCEL_URL is a preview host", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "skltrucks-git-cursor-canonical-www-47f9.vercel.app";
    const r = robots();
    expect(r.host).toBe("https://www.skltrucks.com");
    expect(r.sitemap).toBe("https://www.skltrucks.com/sitemap.xml");
    expect(String(r.host)).not.toContain("vercel.app");
    expect(String(r.sitemap)).not.toMatch(/https:\/\/skltrucks\.com(\/|$)/);
  });

  it("sitemap entries use www and never advertise apex or preview hosts", async () => {
    process.env.VERCEL_URL = "skltrucks-git-feature.vercel.app";
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);

    const home = entries.find((e) => e.url === "https://www.skltrucks.com/");
    const shop = entries.find((e) => e.url === "https://www.skltrucks.com/shop");
    expect(home).toBeDefined();
    expect(shop).toBeDefined();

    for (const entry of entries) {
      expect(entry.url.startsWith("https://www.skltrucks.com")).toBe(true);
      expect(entry.url).not.toContain("vercel.app");
      expect(entry.url).not.toMatch(/^https:\/\/skltrucks\.com(\/|$)/);
    }

    const product = entries.find((e) => e.url.includes("/product/"));
    expect(product).toBeDefined();
    expect(product!.url).toMatch(/^https:\/\/www\.skltrucks\.com\/product\//);
    expect(product!.url).not.toContain("?");
  });

  it("canonical, sitemap, robots, and structured-data base do not conflict", async () => {
    const base = getSiteUrl();
    const metaBase = getMetadataBase();
    const r = robots();
    const entries = await sitemap();
    const homeMeta = indexablePageMetadata("/");
    const shopMeta = indexablePageMetadata("/shop");

    expect(base).toBe("https://www.skltrucks.com");
    expect(metaBase.origin).toBe(base);
    expect(r.host).toBe(base);
    expect(r.sitemap).toBe(`${base}/sitemap.xml`);
    expect(homeMeta.openGraph && "url" in homeMeta.openGraph ? homeMeta.openGraph.url : null).toBe(
      `${base}/`
    );
    expect(shopMeta.openGraph && "url" in shopMeta.openGraph ? shopMeta.openGraph.url : null).toBe(
      `${base}/shop`
    );
    expect(entries.every((e) => e.url.startsWith(base))).toBe(true);

    const websiteLd = {
      "@type": "WebSite",
      url: absoluteUrl("/"),
    };
    expect(websiteLd.url).toBe(
      homeMeta.openGraph && "url" in homeMeta.openGraph ? homeMeta.openGraph.url : null
    );
  });
});
