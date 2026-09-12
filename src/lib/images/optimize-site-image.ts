import sharp from "sharp";

/** Max edge for homepage/site imagery (hero is object-cover at 100vw). */
export const SITE_IMAGE_MAX_WIDTH = 1920;
export const SITE_IMAGE_QUALITY = 75;

/** Reject decompression bombs / absurd pixel counts (~8k × 8k). */
export const SITE_IMAGE_MAX_INPUT_PIXELS = 64_000_000;
export const SITE_IMAGE_MAX_INPUT_DIMENSION = 8192;

export type OptimizedSiteImage = {
  buffer: Buffer;
  contentType: "image/webp";
  extension: "webp";
  width: number;
  height: number;
};

const SHARP_INPUT_OPTIONS = {
  failOn: "error" as const,
  limitInputPixels: SITE_IMAGE_MAX_INPUT_PIXELS,
  sequentialRead: true,
};

function assertSafeDimensions(width?: number, height?: number): void {
  if (!width || !height) {
    throw new Error("Image metadata missing dimensions");
  }
  if (width > SITE_IMAGE_MAX_INPUT_DIMENSION || height > SITE_IMAGE_MAX_INPUT_DIMENSION) {
    throw new Error("Image dimensions exceed safe limits");
  }
  if (width * height > SITE_IMAGE_MAX_INPUT_PIXELS) {
    throw new Error("Image pixel count exceeds safe limits");
  }
}

/**
 * Server-side site-image optimization for upload-time use.
 * Corrects EXIF orientation, never enlarges, caps width, emits WebP.
 */
export async function optimizeSiteImage(
  input: Buffer,
  options?: { maxWidth?: number; quality?: number }
): Promise<OptimizedSiteImage> {
  const maxWidth = options?.maxWidth ?? SITE_IMAGE_MAX_WIDTH;
  const quality = options?.quality ?? SITE_IMAGE_QUALITY;

  const meta = await sharp(input, SHARP_INPUT_OPTIONS).rotate().metadata();
  assertSafeDimensions(meta.width, meta.height);

  const sourceWidth = meta.width ?? maxWidth;
  const targetWidth = Math.min(sourceWidth, maxWidth);

  const { data, info } = await sharp(input, SHARP_INPUT_OPTIONS)
    .rotate()
    .resize({
      width: targetWidth,
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    contentType: "image/webp",
    extension: "webp",
    width: info.width,
    height: info.height,
  };
}

export async function resizeSiteImageToWidth(
  input: Buffer,
  width: number,
  quality = SITE_IMAGE_QUALITY
): Promise<Buffer> {
  const meta = await sharp(input, SHARP_INPUT_OPTIONS).rotate().metadata();
  assertSafeDimensions(meta.width, meta.height);

  return sharp(input, SHARP_INPUT_OPTIONS)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();
}
