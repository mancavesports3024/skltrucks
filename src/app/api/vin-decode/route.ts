import { NextResponse } from "next/server";
import { fetchVpicDecode, mapVpicResult } from "@/lib/vin/decode";
import { validateVin } from "@/lib/vin/validate";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to use VIN lookup." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const validation = validateVin(searchParams.get("vin") ?? "");

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const year = searchParams.get("year")?.trim() ?? "";

  try {
    const vpic = await fetchVpicDecode(validation.vin, year || undefined);
    const decoded = mapVpicResult(vpic);

    if ("error" in decoded) {
      return NextResponse.json({ error: decoded.error }, { status: 422 });
    }

    return NextResponse.json({
      vin: validation.vin,
      ...decoded,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "VIN lookup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
