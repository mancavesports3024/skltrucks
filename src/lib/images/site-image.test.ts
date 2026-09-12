import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  FALLBACK_SUPABASE_HOSTNAME,
  HERO_IMAGE_SIZES,
  SITE_IMAGE_PUBLIC_PREFIX,
  buildSiteImageDeliveryUrl,
  buildSiteImageSrcSet,
  canDeliverViaSiteImageApi,
  getApprovedSupabaseHostname,
  parseApprovedSiteImageUrl,
} from "@/lib/images/site-image-delivery";
import {
  SITE_IMAGE_MAX_INPUT_DIMENSION,
  optimizeSiteImage,
  resizeSiteImageToWidth,
} from "@/lib/images/optimize-site-image";
import {
  normalizeImageContentType,
  parseSiteImageQualityParam,
  parseSiteImageWidthParam,
} from "@/lib/images/site-image-request";

const HOST = FALLBACK_SUPABASE_HOSTNAME;
const APPROVED = `https://${HOST}${SITE_IMAGE_PUBLIC_PREFIX}site/1788877813635-n1l8odn0jgr.jpg`;

describe("parseApprovedSiteImageUrl / canDeliverViaSiteImageApi", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("accepts the exact approved HTTPS site-images object URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${HOST}`;
    const parsed = parseApprovedSiteImageUrl(APPROVED);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.normalized).toBe(APPROVED);
      expect(parsed.url.hostname).toBe(HOST);
    }
    expect(canDeliverViaSiteImageApi(APPROVED)).toBe(true);
    expect(getApprovedSupabaseHostname()).toBe(HOST);
  });

  it("rejects wrong hosts including other supabase projects and private/localhost names", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${HOST}`;
    const rejected = [
      `https://evil.supabase.co${SITE_IMAGE_PUBLIC_PREFIX}site/a.jpg`,
      `https://127.0.0.1${SITE_IMAGE_PUBLIC_PREFIX}site/a.jpg`,
      `https://localhost${SITE_IMAGE_PUBLIC_PREFIX}site/a.jpg`,
      `https://169.254.169.254${SITE_IMAGE_PUBLIC_PREFIX}site/a.jpg`,
      `https://example.com${SITE_IMAGE_PUBLIC_PREFIX}site/a.jpg`,
    ];
    for (const url of rejected) {
      expect(canDeliverViaSiteImageApi(url), url).toBe(false);
      expect(parseApprovedSiteImageUrl(url).ok, url).toBe(false);
    }
  });

  it("rejects non-HTTPS, credentials, custom ports, query, and hash", () => {
    const rejected = [
      APPROVED.replace("https://", "http://"),
      `https://user:pass@${HOST}${SITE_IMAGE_PUBLIC_PREFIX}site/a.jpg`,
      `https://user@${HOST}${SITE_IMAGE_PUBLIC_PREFIX}site/a.jpg`,
      `https://${HOST}:8443${SITE_IMAGE_PUBLIC_PREFIX}site/a.jpg`,
      `https://${HOST}:10443${SITE_IMAGE_PUBLIC_PREFIX}site/a.jpg`,
      `${APPROVED}?download=1`,
      `${APPROVED}#frag`,
      "not-a-url",
      "",
      "/relative/path.jpg",
      "data:image/png;base64,aaaa",
    ];
    for (const url of rejected) {
      expect(parseApprovedSiteImageUrl(url).ok, url).toBe(false);
      expect(canDeliverViaSiteImageApi(url), url).toBe(false);
    }
  });

  it("rejects paths outside the public site-images bucket and traversal", () => {
    const rejected = [
      `https://${HOST}/storage/v1/object/public/product-images/a.jpg`,
      `https://${HOST}/storage/v1/object/sign/site-images/site/a.jpg`,
      `https://${HOST}/storage/v1/render/image/public/site-images/site/a.jpg`,
      `https://${HOST}${SITE_IMAGE_PUBLIC_PREFIX}`,
      `https://${HOST}${SITE_IMAGE_PUBLIC_PREFIX}../product-images/a.jpg`,
      `https://${HOST}${SITE_IMAGE_PUBLIC_PREFIX}site/%2e%2e/secret.jpg`,
      `https://${HOST}${SITE_IMAGE_PUBLIC_PREFIX}site/%2e%2e%2fsecret.jpg`,
      `https://${HOST}/storage/v1/object/public/site-images%2f../product-images/a.jpg`,
    ];
    for (const url of rejected) {
      expect(parseApprovedSiteImageUrl(url).ok, url).toBe(false);
    }
  });
});

describe("buildSiteImageDeliveryUrl cache keys", () => {
  it("uses a stable query order for identical inputs", () => {
    const a = buildSiteImageDeliveryUrl(APPROVED, 828, { quality: 75 });
    const b = buildSiteImageDeliveryUrl(APPROVED, 828, { quality: 75 });
    expect(a).toBe(b);
    expect(a).toBe(`/api/site-image?url=${encodeURIComponent(APPROVED)}&w=828&q=75`);

    const srcSet = buildSiteImageSrcSet(APPROVED);
    expect(srcSet).toContain("640w");
    expect(srcSet).toContain("1920w");
    expect(HERO_IMAGE_SIZES).toBe("100vw");
    expect(buildSiteImageDeliveryUrl("/logo.png", 640)).toBe("/logo.png");
    expect(buildSiteImageSrcSet("/logo.png")).toBeUndefined();
  });
});

describe("site-image request params", () => {
  it("allows only the width allowlist and bounded integer quality", () => {
    expect(parseSiteImageWidthParam("828")).toBe(828);
    expect(parseSiteImageWidthParam("999")).toBeNull();
    expect(parseSiteImageWidthParam("828.5")).toBeNull();
    expect(parseSiteImageWidthParam("-828")).toBeNull();
    expect(parseSiteImageWidthParam("0")).toBeNull();

    expect(parseSiteImageQualityParam(null)).toBe(75);
    expect(parseSiteImageQualityParam("75")).toBe(75);
    expect(parseSiteImageQualityParam("50")).toBe(50);
    expect(parseSiteImageQualityParam("80")).toBe(80);
    expect(parseSiteImageQualityParam("49")).toBeNull();
    expect(parseSiteImageQualityParam("81")).toBeNull();
    expect(parseSiteImageQualityParam("75.5")).toBeNull();
    expect(parseSiteImageQualityParam("abc")).toBeNull();
  });

  it("normalizes content-type headers", () => {
    expect(normalizeImageContentType("image/jpeg; charset=binary")).toBe("image/jpeg");
    expect(normalizeImageContentType("text/html")).toBe("text/html");
    expect(normalizeImageContentType(null)).toBeNull();
  });
});

describe("optimize-site-image safeguards", () => {
  it("downscales without enlarging and emits webp", async () => {
    const input = await sharp({
      create: {
        width: 2400,
        height: 1200,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    })
      .jpeg()
      .toBuffer();

    const optimized = await optimizeSiteImage(input, { maxWidth: 1920, quality: 75 });
    expect(optimized.contentType).toBe("image/webp");
    expect(optimized.extension).toBe("webp");
    expect(optimized.width).toBe(1920);
    expect(optimized.height).toBe(960);
    expect(optimized.buffer.byteLength).toBeGreaterThan(1000);
    expect(optimized.buffer.byteLength).toBeLessThan(input.byteLength);
  });

  it("does not enlarge smaller sources", async () => {
    const input = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .png()
      .toBuffer();

    const resized = await resizeSiteImageToWidth(input, 828, 75);
    const meta = await sharp(resized).metadata();
    expect(meta.width).toBe(400);
    expect(meta.format).toBe("webp");
  });

  it("rejects images that exceed safe input dimensions", async () => {
    const huge = await sharp({
      create: {
        width: SITE_IMAGE_MAX_INPUT_DIMENSION + 1,
        height: 16,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    await expect(resizeSiteImageToWidth(huge, 640, 75)).rejects.toThrow(/dimensions/i);
  });
});
