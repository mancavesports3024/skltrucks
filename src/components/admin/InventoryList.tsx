import Image from "next/image";
import Link from "next/link";
import DeleteButton from "@/components/admin/DeleteButton";
import { formatPrice } from "@/lib/inventory";
import type { Product } from "@/types/product";

interface InventoryListProps {
  products: Product[];
  dbReady: boolean;
}

export default function InventoryList({ products, dbReady }: InventoryListProps) {
  if (products.length === 0) {
    return (
      <p className="bg-white p-8 text-center text-sm text-neutral-500 shadow">
        No trucks in inventory yet.
      </p>
    );
  }

  return (
    <>
      {/* Mobile card layout */}
      <div className="space-y-4 md:hidden">
        {products.map((product) => (
          <article key={product.id} className="bg-white p-4 shadow">
            <div className="flex gap-4">
              {product.image && (
                <div className="relative h-20 w-28 shrink-0">
                  <Image
                    src={product.image}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="112px"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug line-clamp-3">{product.name}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {product.year} {product.manufacturer}
                </p>
                <p className="mt-2 text-lg font-bold text-[#fc0527]">
                  {formatPrice(product.price)}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono break-all text-neutral-600">VIN: {product.vin || "—"}</span>
              <span
                className={`rounded px-2 py-1 font-semibold ${
                  product.published !== false
                    ? "bg-green-100 text-green-700"
                    : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {product.published !== false ? "Published" : "Draft"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Link
                href={`/admin/products/${product.id}`}
                className="flex min-h-11 items-center justify-center bg-[#fc0527] px-3 py-2.5 text-center text-sm font-semibold text-white"
              >
                Edit
              </Link>
              {dbReady ? (
                <Link
                  href={`/admin/products/new?copyFrom=${product.id}`}
                  className="flex min-h-11 items-center justify-center border border-neutral-300 px-3 py-2.5 text-center text-sm font-semibold"
                >
                  Copy
                </Link>
              ) : (
                <span />
              )}
              {dbReady ? (
                <div className="flex min-h-11 items-center justify-center border border-red-200 px-3 py-2.5">
                  <DeleteButton id={product.id} className="text-sm font-semibold" />
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto bg-white shadow md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left">
            <tr>
              <th className="p-4">Photo</th>
              <th className="p-4">Name</th>
              <th className="p-4">Price</th>
              <th className="p-4">VIN</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b hover:bg-neutral-50">
                <td className="p-4">
                  {product.image && (
                    <div className="relative h-14 w-20">
                      <Image
                        src={product.image}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    </div>
                  )}
                </td>
                <td className="max-w-xs p-4">
                  <p className="line-clamp-2 font-medium">{product.name}</p>
                  <p className="text-xs text-neutral-500">
                    {product.year} {product.manufacturer}
                  </p>
                </td>
                <td className="p-4 font-semibold">{formatPrice(product.price)}</td>
                <td className="p-4 font-mono text-xs">{product.vin}</td>
                <td className="p-4">
                  <span
                    className={`rounded px-2 py-1 text-xs font-semibold ${
                      product.published !== false
                        ? "bg-green-100 text-green-700"
                        : "bg-neutral-200 text-neutral-600"
                    }`}
                  >
                    {product.published !== false ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="font-medium text-[#fc0527] hover:underline"
                    >
                      Edit
                    </Link>
                    {dbReady && (
                      <Link
                        href={`/admin/products/new?copyFrom=${product.id}`}
                        className="font-medium text-neutral-700 hover:underline"
                      >
                        Copy
                      </Link>
                    )}
                    {dbReady && <DeleteButton id={product.id} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
