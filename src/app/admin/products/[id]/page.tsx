import Link from "next/link";
import { notFound } from "next/navigation";
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
      <header className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4">
          <Link href="/admin" className="text-sm hover:text-[#fc0527]">← Back</Link>
          <h1 className="text-xl font-bold">Edit Truck</h1>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <ProductForm product={product} action={boundUpdate} />
      </div>
    </div>
  );
}
