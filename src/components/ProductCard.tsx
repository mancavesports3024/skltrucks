import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types/product";
import { formatPrice } from "@/lib/inventory";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="group bg-white shadow-sm transition-shadow hover:shadow-md">
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
      <div className="p-4">
        <Link href={`/product/${product.slug}`}>
          <h3 className="mb-2 line-clamp-2 text-sm font-semibold leading-snug hover:text-[#fc0527] transition-colors">
            {product.name}
          </h3>
        </Link>
        <p className="mb-2 text-xs text-neutral-500">{product.categories.join(", ")}</p>
        <p className="mb-3 text-lg font-bold text-[#fc0527]">{formatPrice(product.price)}</p>
        <table className="w-full text-xs text-neutral-600">
          <tbody>
            <tr><td className="font-semibold pr-2">VIN</td><td>{product.vin}</td></tr>
            <tr><td className="font-semibold pr-2">YEAR</td><td>{product.year}</td></tr>
            <tr><td className="font-semibold pr-2">Manufacturer</td><td>{product.manufacturer}</td></tr>
            <tr><td className="font-semibold pr-2">Model</td><td>{product.model}</td></tr>
            <tr><td className="font-semibold pr-2">MILES</td><td>{product.miles}</td></tr>
          </tbody>
        </table>
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
