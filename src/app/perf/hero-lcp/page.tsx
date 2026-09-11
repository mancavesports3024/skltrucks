import {
  HERO_IMAGE_SIZES,
  buildSiteImageDeliveryUrl,
  buildSiteImageSrcSet,
} from "@/lib/images/site-image-delivery";

/**
 * Internal LCP fixture — not linked from the public nav.
 * Uses the production hero asset URL through /api/site-image so we can
 * measure delivery without changing site_content.
 */
const PRODUCTION_HERO =
  "https://kgnhisdckorctefbggwo.supabase.co/storage/v1/object/public/site-images/site/1788877813635-n1l8odn0jgr.jpg";

export const dynamic = "force-dynamic";

export default function HeroLcpFixturePage() {
  const src = buildSiteImageDeliveryUrl(PRODUCTION_HERO, 828);
  const srcSet = buildSiteImageSrcSet(PRODUCTION_HERO);

  return (
    <main className="min-h-screen bg-neutral-900">
      <section className="relative flex min-h-[70vh] items-center justify-center overflow-hidden">
        <link
          rel="preload"
          as="image"
          href={src}
          imageSrcSet={srcSet}
          imageSizes={HERO_IMAGE_SIZES}
          fetchPriority="high"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          srcSet={srcSet}
          sizes={HERO_IMAGE_SIZES}
          alt="Hero LCP fixture"
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
          decoding="async"
        />
        <div className="absolute inset-0 bg-black/50" />
        <h1 className="relative z-10 px-4 text-center font-oswald text-4xl font-bold uppercase text-white">
          Hero delivery fixture
        </h1>
      </section>
    </main>
  );
}
