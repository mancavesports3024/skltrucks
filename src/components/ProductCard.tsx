import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types/product";
import { formatPrice } from "@/lib/inventory";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="group overflow-hidden bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link href={`/product/${product.slug}`} className="block overflow-hidden">
        <div className="relative aspect-[4/3] bg-neutral-100">
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
          />
        </div>
      </Link>
      <div className="overflow-hidden p-4">
        <Link href={`/product/${product.slug}`}>
          <h3 className="mb-2 line-clamp-2 text-sm font-semibold leading-snug hover:text-[#fc0527] transition-colors">
            {product.name}
          </h3>
        </Link>
        <p className="mb-2 text-xs text-neutral-500">{product.categories.join(", ")}</p>
        <p className="mb-3 text-lg font-bold text-[#fc0527]">{formatPrice(product.price)}</p>
        <dl className="space-y-1 text-xs text-neutral-600">
          {[
            ["VIN", product.vin],
            ["YEAR", product.year],
            ["Manufacturer", product.manufacturer],
            ["Model", product.model],
            ["MILES", product.miles],
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[5.5rem_1fr] gap-x-2">
              <dt className="font-semibold shrink-0">{label}</dt>
              <dd className="min-w-0 break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <Link
          href={`/product/${product.slug}`}
          className="mt-4 inline-block text-sm font-semibold uppercase text-[#fc0527] hover:underline"
        >
          View Details
        </Link>
      </div>
    </article>
  );
}
