import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSourcingStaffEmail } from "@/lib/sourcing/staff";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
  const isAdminApiRoute = request.nextUrl.pathname.startsWith("/api/admin");
  const isLoginPage = request.nextUrl.pathname === "/admin/login";
  const isSourcingRoute = request.nextUrl.pathname.startsWith("/admin/sourcing");

  if (isAdminApiRoute && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isAdminRoute && !isLoginPage && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  // Extra gate for sourcing UI (RLS + server actions still enforce DB allowlist)
  if (isSourcingRoute && user && !isSourcingStaffEmail(user.email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    // Distinguish empty/missing env vs email not on the list (still deny either way)
    const allowlistConfigured = (process.env.SOURCING_STAFF_EMAILS ?? "").trim().length > 0;
    url.searchParams.set(
      "error",
      allowlistConfigured ? "sourcing_forbidden_email" : "sourcing_forbidden_env"
    );
    return NextResponse.redirect(url);
  }

  if (isLoginPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
