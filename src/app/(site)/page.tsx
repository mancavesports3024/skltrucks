import Image from "next/image";
import Link from "next/link";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import SectionTitle from "@/components/SectionTitle";
import ProductGrid from "@/components/ProductGrid";
import { getAllProducts } from "@/lib/inventory";
import { getSiteContent } from "@/lib/site-content";

export default async function HomePage() {
  const [featured, site] = await Promise.all([
    getAllProducts().then((products) => products.slice(0, 4)),
    getSiteContent(),
  ]);

  const ctaLines = site.cta.headline.split("\n").filter(Boolean);

  return (
    <>
      <Hero content={site.hero} social={site.social} />
      <Marquee />

      <section id="about-sec" className="py-16 md:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:grid-cols-2">
          <div className="relative aspect-square overflow-hidden rounded-sm">
            <Image
              src={site.about.image}
              alt="SKL Trucks LLC team"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          <div>
            <SectionTitle subtitle={site.about.subtitle} title={site.about.title} />
            <p className="mt-6 text-neutral-600 leading-relaxed">{site.about.body}</p>
          </div>
        </div>
      </section>

      <section id="our-inventory" className="bg-[#f6f6f6] py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-12 text-center">
            <h2 className="font-oswald text-4xl font-bold uppercase md:text-5xl">OUR INVENTORY</h2>
            <span className="mx-auto mt-3 block h-1 w-16 bg-[#fc0527]" />
          </div>
          <ProductGrid products={featured} />
          <div className="mt-12 text-center">
            <Link
              href="/shop"
              className="inline-block border-2 border-[#fc0527] bg-[#fc0527] px-8 py-3 text-sm font-semibold uppercase text-white transition-colors hover:bg-transparent hover:text-[#fc0527]"
            >
              View All
            </Link>
          </div>
        </div>
      </section>

      <section className="relative flex min-h-[400px] items-center justify-center py-20">
        <Image src={site.cta.image} alt="" fill className="object-cover" sizes="100vw" />
        <div className="absolute inset-0 bg-black/55" />
        <div className="relative z-10 mx-auto max-w-3xl px-4 text-center text-white">
          <h2 className="font-oswald text-3xl font-bold uppercase leading-tight md:text-5xl">
            {ctaLines.map((line, index) => (
              <span key={index}>
                {line}
                {index < ctaLines.length - 1 && <br />}
              </span>
            ))}
          </h2>
          <Link
            href={site.cta.buttonLink}
            className="mt-8 inline-block border-2 border-white bg-transparent px-8 py-3 text-sm font-semibold uppercase transition-colors hover:bg-white hover:text-black"
          >
            {site.cta.buttonText}
          </Link>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-12 text-center">
            <SectionTitle subtitle="OUR SERVICES" title="WHAT WE DO" centered />
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {site.services.map((service) => (
              <div
                key={service.title}
                className="border border-neutral-200 p-8 text-center transition-shadow hover:shadow-lg"
              >
                <h3 className="mb-4 text-lg font-bold uppercase">{service.title}</h3>
                <p className="mb-6 text-sm text-neutral-600 leading-relaxed">{service.description}</p>
                <Link
                  href={service.href}
                  className="text-sm font-semibold uppercase text-[#fc0527] hover:underline"
                >
                  Read More
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f6f6f6] py-16 md:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:grid-cols-2">
          <div>
            <SectionTitle subtitle={site.whyChoose.subtitle} title={site.whyChoose.title} />
            <p className="mt-6 text-neutral-600 leading-relaxed">{site.whyChoose.body}</p>
          </div>
          <div className="relative aspect-square">
            <Image
              src={site.whyChoose.image}
              alt="SKL Trucks"
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>
    </>
  );
}
