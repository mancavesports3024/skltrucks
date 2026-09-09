import { NextResponse } from "next/server";
import { getAdminProduct } from "@/app/admin/actions";
import { buildSalesSheetFilename } from "@/lib/sales-sheet/filename";
import { buildSalesSheetHtml } from "@/lib/sales-sheet/html";
import { renderSalesSheetPdf } from "@/lib/sales-sheet/pdf";
import { getSiteContent } from "@/lib/site-content";
import { createClient } from "@/lib/supabase/server";
import { getPublicDetails } from "@/lib/vin/decode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const product = await getAdminProduct(id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const site = await getSiteContent();
  const details = Object.entries(getPublicDetails(product.details));
  const origin = new URL(request.url).origin;
  const filename = buildSalesSheetFilename(product);

  try {
    const html = buildSalesSheetHtml({
      product,
      details,
      phone: site.contact.phone,
      email: site.contact.email,
      address: site.contact.address,
      origin,
    });

    const pdf = await renderSalesSheetPdf(html);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[sales-sheet-pdf]", error);
    return NextResponse.json(
      { error: "Could not generate PDF. Please try again." },
      { status: 500 }
    );
  }
}
