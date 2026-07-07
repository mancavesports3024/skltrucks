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
        <ProductForm product={product} action={boundUpdate} />
      </div>
    </div>
  );
}
