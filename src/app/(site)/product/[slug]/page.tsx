import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGrid from "@/components/ProductGrid";
import { SITE } from "@/lib/constants";
import { formatPrice, getAllProducts, getProductBySlug } from "@/lib/inventory";

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

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = (await getAllProducts())
    .filter((p) => p.id !== product.id && p.type === product.type)
    .slice(0, 4);

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4">
        <nav className="mb-6 text-sm text-neutral-500">
          <Link href="/" className="hover:text-[#fc0527]">Home</Link>
          <span className="mx-2">»</span>
          <Link href="/shop" className="hover:text-[#fc0527]">Inventory</Link>
          <span className="mx-2">»</span>
          <span className="text-neutral-800">{product.year} {product.manufacturer}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <div className="relative aspect-[4/3] bg-neutral-100 mb-4">
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            </div>
            {product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {product.images.slice(0, 8).map((img, i) => (
                  <div key={i} className="relative aspect-square bg-neutral-100">
                    <Image src={img} alt="" fill className="object-cover" sizes="100px" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold leading-snug md:text-3xl">{product.name}</h1>
            <p className="mt-4 text-3xl font-bold text-[#fc0527]">{formatPrice(product.price)}</p>

            <table className="mt-6 w-full text-sm">
              <tbody>
                {[
                  ["VIN", product.vin],
                  ["YEAR", product.year],
                  ["Manufacturer", product.manufacturer],
                  ["Model", product.model],
                  ["MILES", product.miles],
                  ["HOURS", product.hours || "—"],
                  ...(product.condition ? [["Condition", product.condition]] : []),
                ].map(([label, value]) => (
                  <tr key={label} className="border-b border-neutral-100">
                    <td className="py-2 font-semibold pr-4">{label}</td>
                    <td className="py-2">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-4 text-sm text-neutral-500">{product.categories.join(", ")}</p>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href={SITE.phoneHref}
                className="bg-[#fc0527] px-8 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] transition-colors"
              >
                Call to Inquire
              </a>
              <Link
                href="/contact-us"
                className="border-2 border-[#fc0527] px-8 py-3 text-sm font-semibold uppercase text-[#fc0527] hover:bg-[#fc0527] hover:text-white transition-colors"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>

        {Object.keys(product.details).length > 0 && (
          <section className="mt-16">
            <h2 className="mb-6 text-2xl font-bold uppercase border-b pb-3">Description</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(product.details).map(([key, value]) => (
                    <tr key={key} className="border-b border-neutral-100 even:bg-neutral-50">
                      <td className="py-2 px-4 font-medium w-1/3">{key}</td>
                      <td className="py-2 px-4">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="mb-8 text-2xl font-bold uppercase">Related Products</h2>
            <ProductGrid products={related} />
          </section>
        )}
      </div>
    </div>
  );
}
