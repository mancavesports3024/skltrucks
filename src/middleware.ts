import { type NextRequest, NextResponse } from "next/server";
import { resolveProductCategoryRedirect } from "@/lib/seo/category-redirects";
import { updateSession } from "@/lib/supabase/middleware";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/product-category/")) {
    const slug = pathname.slice("/product-category/".length).replace(/\/$/, "");
    const destination = resolveProductCategoryRedirect(slug);
    return NextResponse.redirect(new URL(destination, request.url), 301);
  }

  const isAdminRoute = pathname.startsWith("/admin");
  const isLoginPage = pathname === "/admin/login";

  if (!isSupabaseConfigured()) {
    if (isAdminRoute && !isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (isAdminRoute) {
    return await updateSession(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/product-category/:path*"],
};
