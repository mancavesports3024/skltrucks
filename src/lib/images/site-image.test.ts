import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  HERO_IMAGE_SIZES,
  buildSiteImageDeliveryUrl,
  buildSiteImageSrcSet,
  canDeliverViaSiteImageApi,
} from "@/lib/images/site-image-delivery";
import {
  optimizeSiteImage,
  resizeSiteImageToWidth,
} from "@/lib/images/optimize-site-image";

const SUPABASE_HERO =
  "https://kgnhisdckorctefbggwo.supabase.co/storage/v1/object/public/site-images/site/1788877813635-n1l8odn0jgr.jpg";

describe("site-image-delivery", () => {
  it("allows Supabase public object URLs only", () => {
    expect(canDeliverViaSiteImageApi(SUPABASE_HERO)).toBe(true);
    expect(canDeliverViaSiteImageApi("/logo.png")).toBe(false);
    expect(canDeliverViaSiteImageApi("https://example.com/a.jpg")).toBe(false);
    expect(
      canDeliverViaSiteImageApi(
        "https://kgnhisdckorctefbggwo.supabase.co/storage/v1/render/image/public/site-images/x.jpg"
      )
    ).toBe(false);
  });

  it("builds width-specific delivery URLs and srcset", () => {
    const url = buildSiteImageDeliveryUrl(SUPABASE_HERO, 828);
    expect(url).toContain("/api/site-image?");
    expect(url).toContain("w=828");
    expect(url).toContain("url=");

    const srcSet = buildSiteImageSrcSet(SUPABASE_HERO);
    expect(srcSet).toBeDefined();
    expect(srcSet).toContain("640w");
    expect(srcSet).toContain("1920w");
    expect(HERO_IMAGE_SIZES).toBe("100vw");
  });

  it("leaves non-supabase sources unchanged", () => {
    expect(buildSiteImageDeliveryUrl("/logo.png", 640)).toBe("/logo.png");
    expect(buildSiteImageSrcSet("/logo.png")).toBeUndefined();
  });
});

describe("optimize-site-image", () => {
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
});
