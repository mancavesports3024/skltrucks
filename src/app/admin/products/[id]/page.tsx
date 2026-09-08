import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import ProductForm from "@/components/admin/ProductForm";
import { getAdminProduct, updateProduct } from "@/app/admin/actions";

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;
  const product = await getAdminProduct(id);
  if (!product) notFound();

  const boundUpdate = updateProduct.bind(null, id);

  return (
    <div>
      <AdminPageHeader title="Edit Truck" />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-600 line-clamp-2">{product.name}</p>
          <Link
            href={`/admin/products/${id}/print`}
            className="flex min-h-11 shrink-0 items-center justify-center border-2 border-neutral-800 px-6 py-2.5 text-center text-sm font-semibold uppercase text-neutral-800 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            Print
          </Link>
        </div>
        <ProductForm product={product} action={boundUpdate} />
      </div>
    </div>
  );
}
