import { NextResponse } from "next/server";
import { getAllProducts } from "@/lib/inventory";
import { buildMetaInventoryFeed } from "@/lib/meta/inventory-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

/**
 * Public Meta Commerce Manager vehicle inventory feed.
 * Source of truth: the same published Supabase products query used by /shop.
 */
export async function GET() {
  try {
    const products = await getAllProducts();
    const feed = buildMetaInventoryFeed(products);

    if (feed.issues.length > 0) {
      console.warn(
        `[meta-inventory] ${feed.issues.length} validation issue(s) across ${feed.rows.length} vehicle(s)`
      );
      for (const issue of feed.issues.slice(0, 50)) {
        console.warn(
          `[meta-inventory] ${issue.severity} ${issue.slug} ${issue.field}: ${issue.message}`
        );
      }
    }

    return new NextResponse(feed.csv, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'inline; filename="meta-inventory.csv"',
        "X-Meta-Feed-Vehicle-Count": String(feed.rows.length),
        "X-Meta-Feed-Issue-Count": String(feed.issues.length),
      },
    });
  } catch (err) {
    console.error("[meta-inventory] failed to build feed:", err);
    return NextResponse.json(
      { error: "Failed to build Meta inventory feed" },
      {
        status: 500,
        headers: NO_STORE_HEADERS,
      }
    );
  }
}
