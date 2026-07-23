import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGallery from "@/components/ProductGallery";
import ProductGrid from "@/components/ProductGrid";
import { SITE } from "@/lib/constants";
import { formatPrice, getAllProducts, getProductBySlug } from "@/lib/inventory";
import { getCabTypeLabel, getManufacturerLabel } from "@/lib/product-labels";
import { getPublicDetails } from "@/lib/vin/decode";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const products = await getAllProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product Not Found" };
  return { title: product.name };
}

function SpecList({ items }: { items: [string, string][] }) {
  return (
    <dl className="divide-y divide-neutral-100 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4">
          <dt className="font-semibold">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = (await getAllProducts())
    .filter((p) => p.id !== product.id && p.type === product.type)
    .slice(0, 4);

  const publicDetails = Object.entries(getPublicDetails(product.details));

  const specs: [string, string][] = [
    ["Cab Type", product.cabType ? getCabTypeLabel(product.cabType) : "—"],
    ["VIN", product.vin],
    ["YEAR", product.year],
    ["Manufacturer", product.manufacturer ? getManufacturerLabel(product.manufacturer) : "—"],
    ["Model", product.model],
    ["MILES", product.miles],
    ["HOURS", product.hours || "—"],
    ...(product.condition ? [["Condition", product.condition] as [string, string]] : []),
  ];

  return (
    <div className="py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4">
        <nav className="mb-4 flex flex-wrap gap-x-2 gap-y-1 text-sm text-neutral-500">
          <Link href="/" className="hover:text-[#fc0527]">
            Home
          </Link>
          <span>»</span>
          <Link href="/shop" className="hover:text-[#fc0527]">
            Inventory
          </Link>
          <span>»</span>
          <span className="text-neutral-800">
            {product.year} {product.manufacturer}
          </span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
          <ProductGallery
            name={product.name}
            images={product.images.length ? product.images : product.image ? [product.image] : []}
          />

          <div>
            <h1 className="text-xl font-bold leading-snug sm:text-2xl md:text-3xl">{product.name}</h1>
            <p className="mt-4 text-2xl font-bold text-[#fc0527] sm:text-3xl">
              {formatPrice(product.price)}
            </p>

            <div className="mt-6">
              <SpecList items={specs} />
            </div>

            <p className="mt-4 text-sm leading-relaxed text-neutral-500">
              {product.categories.join(", ")}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href={SITE.phoneHref}
                className="flex min-h-12 items-center justify-center bg-[#fc0527] px-8 py-3 text-center text-sm font-semibold uppercase text-white transition-colors hover:bg-[#d90422]"
              >
                Call to Inquire
              </a>
              <Link
                href="/contact-us"
                className="flex min-h-12 items-center justify-center border-2 border-[#fc0527] px-8 py-3 text-center text-sm font-semibold uppercase text-[#fc0527] transition-colors hover:bg-[#fc0527] hover:text-white"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>

        {publicDetails.length > 0 && (
          <section className="mt-12 sm:mt-16">
            <h2 className="mb-4 border-b pb-3 text-xl font-bold uppercase sm:mb-6 sm:text-2xl">
              Description
            </h2>
            <SpecList items={publicDetails} />
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-12 sm:mt-16">
            <h2 className="mb-6 text-xl font-bold uppercase sm:mb-8 sm:text-2xl">Related Products</h2>
            <ProductGrid products={related} />
          </section>
        )}
      </div>
    </div>
  );
}
