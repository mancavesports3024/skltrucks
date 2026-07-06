import Image from "next/image";
import Link from "next/link";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import SectionTitle from "@/components/SectionTitle";
import ProductGrid from "@/components/ProductGrid";
import { SITE } from "@/lib/constants";
import { getAllProducts } from "@/lib/inventory";

export default async function HomePage() {
  const featured = (await getAllProducts()).slice(0, 4);

  return (
    <>
      <Hero />
      <Marquee />

      <section id="about-sec" className="py-16 md:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:grid-cols-2">
          <div className="relative aspect-square overflow-hidden rounded-sm">
            <Image
              src={SITE.aboutImage}
              alt="SKL Trucks LLC team"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          <div>
            <SectionTitle subtitle="ABOUT US" title="WELCOME TO SKL Trucks LLC" />
            <p className="mt-6 text-neutral-600 leading-relaxed">
              We are a family-owned company where integrity meets trucking! We buy and sell class 7 &amp; 8
              trucks and trailers located on Route 66 in Southwest Missouri. We have over 30 years of
              experience buying and selling tractor trucks &amp; trailers of all makes and models. SKL
              Trucks strive to give the best customer service and earning your trust for all your
              transportation needs.
            </p>
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
        <Image src={SITE.ctaImage} alt="" fill className="object-cover" sizes="100vw" />
        <div className="absolute inset-0 bg-black/55" />
        <div className="relative z-10 mx-auto max-w-3xl px-4 text-center text-white">
          <h2 className="font-oswald text-3xl font-bold uppercase leading-tight md:text-5xl">
            Transportation Semi trucks
            <br />
            and Trailers FOR SALE
          </h2>
          <Link
            href="/contact-us"
            className="mt-8 inline-block border-2 border-white bg-transparent px-8 py-3 text-sm font-semibold uppercase transition-colors hover:bg-white hover:text-black"
          >
            Contact Us
          </Link>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-12 text-center">
            <SectionTitle subtitle="OUR SERVICES" title="WHAT WE DO" centered />
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                title: "TRUCK SALES",
                desc: "Explore our wide selection of quality trucks and find the perfect vehicle to meet your needs.",
                href: "/truck-sales",
              },
              {
                title: "TRUCK FINANCING",
                desc: "Get the best financing options for your truck with our easy and flexible financing solutions.",
                href: "/truck-financing",
              },
              {
                title: "SELL MY TRUCK",
                desc: "Easily sell your truck with us – trade-in, consignment, or direct sale options available.",
                href: "/sell-my-truck",
              },
            ].map((service) => (
              <div key={service.title} className="border border-neutral-200 p-8 text-center transition-shadow hover:shadow-lg">
                <h3 className="mb-4 text-lg font-bold uppercase">{service.title}</h3>
                <p className="mb-6 text-sm text-neutral-600 leading-relaxed">{service.desc}</p>
                <Link href={service.href} className="text-sm font-semibold uppercase text-[#fc0527] hover:underline">
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
            <SectionTitle subtitle="WHY CHOOSE US" title="Your Trusted Truck Partner" />
            <p className="mt-6 text-neutral-600 leading-relaxed">
              We specialize in all makes and models in the used truck and trailer industry. Medium duty,
              over the road Trucks and Trailers, Box trucks, Reefer trucks and trailers, Specialty trucks,
              boom Trucks, Crane Trucks, oil field trucks ETC. Let our sales team help you with all your
              transportation needs. If we don&apos;t have it in stock, we will find it for you. We are
              always looking to buy your truck, take it in on trade, or advertise and sell your truck on
              consignment. If you need financing, fill out our credit application. Here at SKL Trucks we
              value you and your business.
            </p>
          </div>
          <div className="relative aspect-square">
            <Image
              src={SITE.whyChooseImage}
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
