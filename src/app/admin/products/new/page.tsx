import AdminPageHeader from "@/components/admin/AdminPageHeader";
import ProductForm from "@/components/admin/ProductForm";
import { createProduct, getAdminProduct } from "@/app/admin/actions";
import type { Product } from "@/types/product";
import { notFound } from "next/navigation";

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
      <AdminPageHeader title={isCopy ? "Copy Truck" : "Add New Truck"} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <ProductForm product={product} isCopy={isCopy} action={createProduct} />
      </div>
    </div>
  );
}
