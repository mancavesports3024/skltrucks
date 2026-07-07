import Link from "next/link";
import { notFound } from "next/navigation";
import ProductForm from "@/components/admin/ProductForm";
import { createProduct, getAdminProduct } from "@/app/admin/actions";
import type { Product } from "@/types/product";

interface NewProductPageProps {
  searchParams: Promise<{ copyFrom?: string }>;
}

function productForCopy(source: Product): Product {
  return {
    ...source,
    id: "",
    slug: "",
    vin: "",
    published: false,
  };
}

export default async function NewProductPage({ searchParams }: NewProductPageProps) {
  const { copyFrom } = await searchParams;
  let product: Product | undefined;
  let isCopy = false;

  if (copyFrom) {
    const source = await getAdminProduct(copyFrom);
    if (!source) notFound();
    product = productForCopy(source);
    isCopy = true;
  }

  return (
    <div>
      <header className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4">
          <Link href="/admin" className="text-sm hover:text-[#fc0527]">
            ← Back
          </Link>
          <h1 className="text-xl font-bold">{isCopy ? "Copy Truck" : "Add New Truck"}</h1>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <ProductForm product={product} isCopy={isCopy} action={createProduct} />
      </div>
    </div>
  );
}
