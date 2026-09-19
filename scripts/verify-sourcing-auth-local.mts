/**
 * Local nonprod authorization checks against Supabase (no OpenAI).
 * Run: npx tsx --env-file=.env.local scripts/verify-sourcing-auth-local.mts
 *
 * Expects admin-aligned is_sourcing_staff() (authenticated role) + search lock RPCs.
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const serviceClient = createClient(url, service, { auth: { persistSession: false } });

  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

  // 1) is_sourcing_staff() as anon → false
  {
    const { data, error } = await anonClient.rpc("is_sourcing_staff");
    const ok = !error && data === false;
    results.push({
      name: "is_sourcing_staff() false for anon",
      ok,
      detail: error?.message || String(data),
    });
  }

  // 2) outsider reads return no rows
  {
    const { data, error } = await anonClient.from("sourcing_truck_leads").select("id").limit(5);
    const ok = !error && Array.isArray(data) && data.length === 0;
    results.push({
      name: "outsider select sourcing_truck_leads returns no rows",
      ok,
      detail: error?.message || `rows=${data?.length}`,
    });
  }

  // 3) outsider inserts fail through RLS
  {
    const { data, error } = await anonClient
      .from("sourcing_truck_leads")
      .insert({
        seller: "RLS Probe",
        source_url: "https://example.com/rls-probe-should-fail",
        source_scope: "rls-probe",
        source_listing_id: "rls-probe-1",
      })
      .select("id")
      .maybeSingle();
    const ok = Boolean(error) && !data;
    results.push({
      name: "outsider insert sourcing_truck_leads fails",
      ok,
      detail: error?.message || (data ? `unexpected id ${data.id}` : "no error"),
    });
  }

  // 4) optional directory bootstrap row still present
  {
    const { data: staff, error } = await serviceClient
      .from("sourcing_authorized_staff")
      .select("email, active")
      .eq("email", "skltrucksllc@gmail.com")
      .maybeSingle();
    const ok = !error && staff?.email === "skltrucksllc@gmail.com";
    results.push({
      name: "optional bootstrap staff directory row present",
      ok,
      detail: error?.message || JSON.stringify(staff),
    });
  }

  // 5) lock RPCs exist (service role is not authenticated JWT → acquire returns false, no error)
  {
    const { data, error } = await serviceClient.rpc("try_acquire_sourcing_search_lock", {
      p_holder: "service-probe@example.com",
      p_ttl_seconds: 60,
    });
    const ok = !error && data === false;
    results.push({
      name: "try_acquire_sourcing_search_lock callable (false without auth role)",
      ok,
      detail: error?.message || String(data),
    });
  }

  {
    const { error } = await serviceClient.rpc("release_sourcing_search_lock", {
      p_holder: "service-probe@example.com",
    });
    results.push({
      name: "release_sourcing_search_lock callable",
      ok: !error,
      detail: error?.message || "ok",
    });
  }

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    if (!r.ok) failed += 1;
  }
  if (failed) {
    console.error(`\n${failed} local auth check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll local sourcing auth checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
