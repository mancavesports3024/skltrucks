import { NextRequest, NextResponse } from "next/server";
import {
  SITE_IMAGE_SRC_WIDTHS,
  canDeliverViaSiteImageApi,
} from "@/lib/images/site-image-delivery";
import { resizeSiteImageToWidth } from "@/lib/images/optimize-site-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_WIDTHS = new Set<number>(SITE_IMAGE_SRC_WIDTHS);
const MAX_QUALITY = 80;
const MIN_QUALITY = 50;

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("url");
  const widthParam = Number(request.nextUrl.searchParams.get("w") || "0");
  const qualityParam = Number(request.nextUrl.searchParams.get("q") || "75");

  if (!src) return badRequest("Missing url");
  if (!canDeliverViaSiteImageApi(src)) {
    return badRequest("URL is not an allowed Supabase public object");
  }
  if (!ALLOWED_WIDTHS.has(widthParam)) {
    return badRequest(`Unsupported width. Allowed: ${[...ALLOWED_WIDTHS].join(", ")}`);
  }

  const quality = Math.min(
    MAX_QUALITY,
    Math.max(MIN_QUALITY, Number.isFinite(qualityParam) ? qualityParam : 75)
  );

  try {
    const upstream = await fetch(src, {
      // Revalidate occasionally; responses are also cached by CDN via Cache-Control.
      next: { revalidate: 86400 },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream image failed (${upstream.status})` },
        { status: 502 }
      );
    }

    const input = Buffer.from(await upstream.arrayBuffer());
    const output = await resizeSiteImageToWidth(input, widthParam, quality);

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[site-image]", error);
    return NextResponse.json({ error: "Could not optimize image" }, { status: 500 });
  }
}
