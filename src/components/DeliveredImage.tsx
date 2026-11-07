import Image from "next/image";
import { preload } from "react-dom";
import {
  buildSiteImageDeliveryUrl,
  buildSiteImageSrcSet,
  canDeliverViaSiteImageApi,
} from "@/lib/images/site-image-delivery";

interface DeliveredImageProps {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  /** Eager, high-priority load for the page's LCP image. */
  priority?: boolean;
  /** Eager load without high priority, for the rest of the visible row. */
  eager?: boolean;
  /** Set on shop cards so the first row can match the viewport column count. */
  gridIndex?: number;
  fill?: boolean;
  width?: number;
  height?: number;
}

/**
 * Responsive WebP for approved Supabase photos.
 * Other sources stay on the unoptimized next/image path.
 */
export default function DeliveredImage({
  src,
  alt,
  sizes,
  className,
  priority = false,
  eager = false,
  gridIndex,
  fill = false,
  width,
  height,
}: DeliveredImageProps) {
  const optimized = canDeliverViaSiteImageApi(src);
  const loadNow = priority || eager;
  const gridAttr = gridIndex == null ? undefined : String(gridIndex);

  if (!optimized) {
    if (fill) {
      return (
        <Image
          src={src}
          alt={alt}
          fill
          className={className}
          sizes={sizes}
          priority={priority}
          loading={loadNow ? "eager" : "lazy"}
          data-grid-index={gridAttr}
        />
      );
    }

    return (
      <Image
        src={src}
        alt={alt}
        width={width ?? 1200}
        height={height ?? 900}
        className={className}
        sizes={sizes}
        priority={priority}
        loading={loadNow ? "eager" : "lazy"}
        data-grid-index={gridAttr}
      />
    );
  }

  const srcSet = buildSiteImageSrcSet(src);
  const fallback = buildSiteImageDeliveryUrl(src, priority ? 1200 : 828);

  if (priority && srcSet) {
    preload(fallback, {
      as: "image",
      imageSrcSet: srcSet,
      imageSizes: sizes,
      fetchPriority: "high",
    });
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fallback}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      width={width}
      height={height}
      data-grid-index={gridAttr}
      className={fill ? `absolute inset-0 h-full w-full ${className ?? ""}` : className}
      loading={loadNow ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      suppressHydrationWarning
    />
  );
}
