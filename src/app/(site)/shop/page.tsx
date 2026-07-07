import ProductGrid from "@/components/ProductGrid";
import ShopFilters from "@/components/shop/ShopFilters";
import { filterProducts } from "@/lib/inventory";
import Link from "next/link";

interface ShopPageProps {
  searchParams: Promise<{ category?: string; manufacturer?: string; sort?: string }>;
}

export const metadata = { title: "Inventory" };

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;
  const products = await filterProducts({
    category: params.category,
    manufacturer: params.manufacturer,
    sort: params.sort,
  });

  return (
    <div className="py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4">
        <h1 className="font-oswald mb-6 text-3xl font-bold uppercase sm:mb-8 sm:text-4xl">
          Inventory
        </h1>

        <div className="grid gap-6 lg:grid-cols-4 lg:gap-8">
          <ShopFilters category={params.category} manufacturer={params.manufacturer} />

          <div className="lg:col-span-3">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-neutral-500">Showing {products.length} results</p>
              <SortLinks
                current={params.sort}
                category={params.category}
                manufacturer={params.manufacturer}
              />
            </div>
            <ProductGrid products={products} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SortLinks({
  current,
  category,
  manufacturer,
}: {
  current?: string;
  category?: string;
  manufacturer?: string;
}) {
  const base = new URLSearchParams();
  if (category) base.set("category", category);
  if (manufacturer) base.set("manufacturer", manufacturer);

  const sorts = [
    { value: "price-asc", label: "Price: low to high" },
    { value: "price-desc", label: "Price: high to low" },
    { value: "year-desc", label: "Year: newest first" },
  ];

  const linkClass = (active: boolean) =>
    `flex min-h-10 items-center rounded border px-3 py-2 text-xs sm:text-sm ${
      active ? "border-[#fc0527] text-[#fc0527]" : "border-neutral-300"
    }`;

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/shop?${base.toString()}`} className={linkClass(!current)}>
        Default
      </Link>
      {sorts.map((s) => {
        const q = new URLSearchParams(base);
        q.set("sort", s.value);
        return (
          <Link key={s.value} href={`/shop?${q.toString()}`} className={linkClass(current === s.value)}>
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
