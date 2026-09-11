import sharp from "sharp";

/** Max edge for homepage/site imagery (hero is object-cover at 100vw). */
export const SITE_IMAGE_MAX_WIDTH = 1920;
export const SITE_IMAGE_QUALITY = 75;

export type OptimizedSiteImage = {
  buffer: Buffer;
  contentType: "image/webp";
  extension: "webp";
  width: number;
  height: number;
};

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

  const image = sharp(input, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const sourceWidth = meta.width ?? maxWidth;

  const targetWidth = Math.min(sourceWidth, maxWidth);
  const pipeline = image
    .resize({
      width: targetWidth,
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

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
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();
}
