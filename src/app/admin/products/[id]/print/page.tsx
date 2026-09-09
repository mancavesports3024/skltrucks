import { notFound } from "next/navigation";
import ProductPrintSheet from "@/components/ProductPrintSheet";
import SalesSheetPreview from "@/components/SalesSheetPreview";
import { getAdminProduct } from "@/app/admin/actions";
import { buildSalesSheetFilename } from "@/lib/sales-sheet/filename";
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
  const downloadFileName = buildSalesSheetFilename(product);

  return (
    <SalesSheetPreview
      productId={id}
      downloadFileName={downloadFileName}
      backHref="/admin"
      editHref={`/admin/products/${id}`}
    >
      <ProductPrintSheet
        product={product}
        details={details}
        phone={site.contact.phone}
        email={site.contact.email}
        address={site.contact.address}
      />
    </SalesSheetPreview>
  );
}
