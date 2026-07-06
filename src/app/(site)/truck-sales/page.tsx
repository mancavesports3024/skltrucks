import Link from "next/link";
import ProductGrid from "@/components/ProductGrid";
import { getAllProducts } from "@/lib/inventory";

export const metadata = { title: "Truck Sales" };

export default async function TruckSalesPage() {
  const products = await getAllProducts();

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4">
        <h1 className="font-oswald mb-4 text-4xl font-bold uppercase">Truck Sales</h1>
        <p className="mb-10 max-w-2xl text-neutral-600 leading-relaxed">
          Explore our wide selection of quality trucks and find the perfect vehicle to meet your needs.
          We specialize in class 7 &amp; 8 trucks including sleeper trucks, day cabs, box trucks, and more.
        </p>
        <ProductGrid products={products} />
        <div className="mt-12 text-center">
          <Link href="/contact-us" className="text-sm font-semibold uppercase text-[#fc0527] hover:underline">
            Contact our sales team
          </Link>
        </div>
      </div>
    </div>
  );
}
