import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const APPROVED =
  "https://kgnhisdckorctefbggwo.supabase.co/storage/v1/object/public/site-images/site/hero.jpg";

vi.mock("@/lib/images/site-image-delivery", async () => {
  const actual = await vi.importActual<typeof import("@/lib/images/site-image-delivery")>(
    "@/lib/images/site-image-delivery"
  );
  return {
    ...actual,
    parseApprovedSiteImageUrl: vi.fn(() => ({
      ok: true as const,
      normalized: APPROVED,
      url: new URL(APPROVED),
    })),
  };
});

import { GET } from "@/app/api/site-image/route";

function siteImageRequest(extra?: { contentType?: string; body?: Buffer; ok?: boolean }) {
  const contentType = extra?.contentType ?? "image/jpeg";
  const body = extra?.body ?? Buffer.from("not-used-when-mocked");
  const ok = extra?.ok ?? true;

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(new Uint8Array(body), {
        status: ok ? 200 : 500,
        headers: { "content-type": contentType },
      });
    })
  );

  return new NextRequest(
    `http://localhost/api/site-image?url=${encodeURIComponent(APPROVED)}&w=640&q=75`
  );
}

describe("/api/site-image content-type gate", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects AVIF before Sharp processing", async () => {
    const avifBytes = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();

    const req = siteImageRequest({ contentType: "image/avif", body: avifBytes });
    const res = await GET(req);
    expect(res.status).toBe(415);
    const json = await res.json();
    expect(json.error).toMatch(/unsupported/i);
  });

  it("accepts JPEG and returns optimized webp", async () => {
    const jpeg = await sharp({
      create: { width: 800, height: 450, channels: 3, background: { r: 12, g: 34, b: 56 } },
    })
      .jpeg()
      .toBuffer();

    const req = siteImageRequest({ contentType: "image/jpeg", body: jpeg });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(640);
  });

  it("accepts PNG and WebP content types", async () => {
    for (const [format, contentType] of [
      ["png", "image/png"],
      ["webp", "image/webp"],
    ] as const) {
      const input = await sharp({
        create: { width: 500, height: 280, channels: 3, background: { r: 90, g: 100, b: 110 } },
      })
        [format]()
        .toBuffer();
      const req = siteImageRequest({ contentType, body: input });
      const res = await GET(req);
      expect(res.status, contentType).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/webp");
    }
  });
});
