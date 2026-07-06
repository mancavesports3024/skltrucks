import Link from "next/link";
import ProductForm from "@/components/admin/ProductForm";
import { createProduct } from "@/app/admin/actions";

export default function NewProductPage() {
  return (
    <div>
      <header className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4">
          <Link href="/admin" className="text-sm hover:text-[#fc0527]">← Back</Link>
          <h1 className="text-xl font-bold">Add New Truck</h1>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <ProductForm action={createProduct} />
      </div>
    </div>
  );
}
