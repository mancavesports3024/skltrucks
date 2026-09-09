import Link from "next/link";
import { notFound } from "next/navigation";
import PrintProductButton from "@/components/PrintProductButton";
import ProductPrintSheet from "@/components/ProductPrintSheet";
import { getAdminProduct } from "@/app/admin/actions";
import { getSiteContent } from "@/lib/site-content";
import { getPublicDetails } from "@/lib/vin/decode";

interface AdminPrintProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminPrintProductPage({ params }: AdminPrintProductPageProps) {
  const { id } = await params;
  const product = await getAdminProduct(id);
  if (!product) notFound();

  const site = await getSiteContent();
  const details = Object.entries(getPublicDetails(product.details));

  return (
    <div className="min-h-screen bg-white">
      <div className="print:hidden border-b border-neutral-200 bg-neutral-100">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/admin" className="font-medium hover:text-[#fc0527]">
              ← Inventory
            </Link>
            <Link href={`/admin/products/${id}`} className="font-medium hover:text-[#fc0527]">
              Edit truck
            </Link>
          </div>
          <PrintProductButton />
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 print:m-0 print:max-w-none print:p-0">
        <ProductPrintSheet
          product={product}
          details={details}
          phone={site.contact.phone}
          email={site.contact.email}
          address={site.contact.address}
          forceVisible
        />
      </div>
    </div>
  );
}
