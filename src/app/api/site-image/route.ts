import { NextRequest, NextResponse } from "next/server";
import { parseApprovedSiteImageUrl } from "@/lib/images/site-image-delivery";
import { resizeSiteImageToWidth } from "@/lib/images/optimize-site-image";
import {
  ALLOWED_SITE_IMAGE_CONTENT_TYPES,
  normalizeImageContentType,
  parseSiteImageQualityParam,
  parseSiteImageWidthParam,
} from "@/lib/images/site-image-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_UPSTREAM_BYTES = 10 * 1024 * 1024;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function errorJson(status: number, message: string) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: NO_STORE_HEADERS,
    }
  );
}

async function readUpstreamBody(
  response: Response,
  maxBytes: number
): Promise<{ ok: true; buffer: Buffer } | { ok: false; status: number }> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return { ok: false, status: 413 };
    }
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) return { ok: false, status: 413 };
    return { ok: true, buffer };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore cancel errors
      }
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }

  return { ok: true, buffer: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))) };
}

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("url");
  const width = parseSiteImageWidthParam(request.nextUrl.searchParams.get("w"));
  const quality = parseSiteImageQualityParam(request.nextUrl.searchParams.get("q"));

  if (!src) return errorJson(400, "Invalid request");
  if (width == null) return errorJson(400, "Invalid request");
  if (quality == null) return errorJson(400, "Invalid request");

  const parsed = parseApprovedSiteImageUrl(src);
  if (!parsed.ok) return errorJson(400, "Invalid request");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    // redirect: "error" prevents open-proxy follow to localhost/private networks.
    const upstream = await fetch(parsed.normalized, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "image/*",
      },
      cache: "no-store",
    });

    if (!upstream.ok) {
      return errorJson(502, "Image unavailable");
    }

    const contentType = normalizeImageContentType(upstream.headers.get("content-type"));
    if (!contentType || !ALLOWED_SITE_IMAGE_CONTENT_TYPES.has(contentType)) {
      return errorJson(415, "Unsupported media type");
    }

    const body = await readUpstreamBody(upstream, MAX_UPSTREAM_BYTES);
    if (!body.ok) {
      return errorJson(body.status, "Image too large");
    }

    const output = await resizeSiteImageToWidth(body.buffer, width, quality);

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        // Browser + shared/CDN caches (Vercel honors s-maxage / CDN directives).
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        "CDN-Cache-Control": "public, s-maxage=31536000, immutable",
        "Vercel-CDN-Cache-Control": "public, s-maxage=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const aborted =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name?: string }).name === "AbortError");

    if (aborted) {
      return errorJson(504, "Image unavailable");
    }

    console.error("[site-image] optimize failed");
    return errorJson(500, "Could not optimize image");
  } finally {
    clearTimeout(timeout);
  }
}
