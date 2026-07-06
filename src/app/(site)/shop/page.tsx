import ProductGrid from "@/components/ProductGrid";
import { INVENTORY_CATEGORIES, MANUFACTURERS } from "@/lib/constants";
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
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4">
        <h1 className="font-oswald mb-8 text-4xl font-bold uppercase">Inventory</h1>

        <div className="grid gap-8 lg:grid-cols-4">
          <aside className="lg:col-span-1">
            <div className="sticky top-32 space-y-6">
              <div>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Categories</h2>
                <ul className="space-y-1 text-sm">
                  <li>
                    <Link href="/shop" className={`hover:text-[#fc0527] ${!params.category ? "font-bold text-[#fc0527]" : ""}`}>
                      All Trucks
                    </Link>
                  </li>
                  {INVENTORY_CATEGORIES.map((cat) => (
                    <li key={cat.slug}>
                      <Link
                        href={`/shop?category=${cat.slug}`}
                        className={`hover:text-[#fc0527] ${params.category === cat.slug ? "font-bold text-[#fc0527]" : ""}`}
                      >
                        {cat.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Manufacturers</h2>
                <ul className="space-y-1 text-sm">
                  {MANUFACTURERS.map((m) => (
                    <li key={m.slug}>
                      <Link
                        href={`/shop?manufacturer=${m.slug}`}
                        className={`hover:text-[#fc0527] ${params.manufacturer === m.slug ? "font-bold text-[#fc0527]" : ""}`}
                      >
                        {m.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>

          <div className="lg:col-span-3">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-neutral-500">Showing {products.length} results</p>
              <SortLinks current={params.sort} category={params.category} manufacturer={params.manufacturer} />
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

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={`/shop?${base.toString()}`}
        className={`rounded border px-3 py-1 text-xs ${!current ? "border-[#fc0527] text-[#fc0527]" : "border-neutral-300"}`}
      >
        Default
      </Link>
      {sorts.map((s) => {
        const q = new URLSearchParams(base);
        q.set("sort", s.value);
        return (
          <Link
            key={s.value}
            href={`/shop?${q.toString()}`}
            className={`rounded border px-3 py-1 text-xs ${current === s.value ? "border-[#fc0527] text-[#fc0527]" : "border-neutral-300"}`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
