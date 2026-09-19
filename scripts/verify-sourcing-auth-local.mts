/**
 * Local nonprod authorization checks against Supabase (no OpenAI).
 * Run: npx tsx --env-file=.env.local scripts/verify-sourcing-auth-local.mts
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

  // 4) SQL: is_sourcing_staff false without matching active row (JWT outsider)
  {
    // Use service role to run raw check via RPC won't set JWT email.
    // Verify inactive/missing row semantics with service + direct SQL via REST is limited;
    // confirm function definition exists and staff row is active for bootstrap email.
    const { data: staff, error } = await serviceClient
      .from("sourcing_authorized_staff")
      .select("email, active")
      .eq("email", "skltrucksllc@gmail.com")
      .maybeSingle();
    const ok = !error && staff?.active === true;
    results.push({
      name: "bootstrap staff row active",
      ok,
      detail: error?.message || JSON.stringify(staff),
    });
  }

  // 5) deactivate probe email → ensure table supports active=false
  {
    const probe = "rls-inactive-probe@example.com";
    await serviceClient.from("sourcing_authorized_staff").upsert({
      email: probe,
      display_name: "Inactive Probe",
      active: false,
    });
    const { data } = await serviceClient
      .from("sourcing_authorized_staff")
      .select("active")
      .eq("email", probe)
      .maybeSingle();
    results.push({
      name: "inactive staff row supported",
      ok: data?.active === false,
      detail: JSON.stringify(data),
    });
    await serviceClient.from("sourcing_authorized_staff").delete().eq("email", probe);
  }

  // 6) lock RPCs exist
  {
    const { error } = await serviceClient.rpc("try_acquire_sourcing_search_lock", {
      p_holder: "service-probe@example.com",
      p_ttl_seconds: 60,
    });
    // service role JWT has no staff email → function should return false (not error)
    results.push({
      name: "try_acquire_sourcing_search_lock callable",
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
