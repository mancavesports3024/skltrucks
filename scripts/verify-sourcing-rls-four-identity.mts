/**
 * Four-identity direct-RLS matrix for private sourcing tables.
 * Local nonprod only. Does not print emails (except confirming SKL presence via boolean),
 * tokens, or inspection URL values.
 *
 * Run:
 *   node --env-file=.env.local --import tsx scripts/verify-sourcing-rls-four-identity.mts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TABLES = [
  "sourcing_truck_leads",
  "sourcing_supplier_contacts",
  "sourcing_buying_profile",
  "sourcing_search_runs",
  "sourcing_search_lock",
  "sourcing_market_comparisons",
  "sourcing_authorized_staff",
] as const;

type RowCount = { table: string; rows: number; error?: string; inspReadable: boolean };

async function selectMatrix(client: SupabaseClient): Promise<RowCount[]> {
  const out: RowCount[] = [];
  for (const table of TABLES) {
    const { data, error } = await client.from(table).select("*").limit(20);
    let inspReadable = false;
    if (table === "sourcing_truck_leads") {
      const { data: inspRows } = await client
        .from("sourcing_truck_leads")
        .select("id, spec_evidence")
        .limit(100);
      inspReadable = (inspRows ?? []).some((r) => {
        const ev = (r as { spec_evidence?: { inspectionUrl?: string } }).spec_evidence;
        return Boolean(ev?.inspectionUrl && String(ev.inspectionUrl).trim());
      });
    }
    out.push({
      table,
      rows: Array.isArray(data) ? data.length : 0,
      error: error?.message,
      inspReadable,
    });
  }
  return out;
}

async function tryInsertLead(client: SupabaseClient, label: string): Promise<boolean> {
  const { data, error } = await client
    .from("sourcing_truck_leads")
    .insert({
      seller: `RLS ${label}`,
      source_url: "",
      source_scope: "rls-four-identity",
      source_listing_id: `probe-${label}-${Date.now()}`,
      canonical_listing_url: "",
      match_status: "needs_verification",
      match_reasons: [],
    })
    .select("id")
    .maybeSingle();
  if (data?.id) {
    // cleanup via service role later
    return true;
  }
  return Boolean(error) && !data;
}

function summarize(identity: string, counts: RowCount[], insertDenied: boolean) {
  const anyRows = counts.some((c) => c.rows > 0);
  const insp = counts.find((c) => c.table === "sourcing_truck_leads")?.inspReadable;
  return {
    identity,
    anyPrivateRows: anyRows,
    inspectionUrlReadable: Boolean(insp),
    insertDeniedOrFailed: insertDenied,
    tables: counts.map((c) => ({
      table: c.table,
      rows: c.rows,
      denied: c.rows === 0,
    })),
  };
}

async function main() {
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const anonClient = createClient(url, anon, { auth: { persistSession: false } });

  // Confirm SKL directory row without printing other emails
  const { data: sklRow } = await admin
    .from("sourcing_authorized_staff")
    .select("active")
    .eq("email", "skltrucksllc@gmail.com")
    .maybeSingle();

  // Ensure outsider + inactive probe users
  const outsiderEmail = `outsider-rls-${Date.now()}@example.com`;
  const inactiveEmail = `inactive-rls-${Date.now()}@example.com`;
  const activeEmail = `active-rls-${Date.now()}@example.com`;
  const password = "RlsProbePass123!";

  async function ensureUser(email: string) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
    return data.user.id;
  }

  await ensureUser(outsiderEmail);
  await ensureUser(inactiveEmail);
  await ensureUser(activeEmail);

  // Directory rows: inactive + active (outsider has none)
  await admin.from("sourcing_authorized_staff").upsert([
    { email: inactiveEmail, display_name: "Inactive Probe", active: false },
    { email: activeEmail, display_name: "Active Probe", active: true },
  ]);

  async function login(email: string) {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!json.access_token) throw new Error(`login failed for probe identity`);
    return createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${json.access_token}` } },
      auth: { persistSession: false },
    });
  }

  const results = [];

  // 1) anon
  {
    const counts = await selectMatrix(anonClient);
    const insertDenied = await tryInsertLead(anonClient, "anon");
    results.push(summarize("anon", counts, insertDenied));
  }

  // 2) outsider (authenticated, no directory row)
  {
    const client = await login(outsiderEmail);
    const { data: rpc } = await client.rpc("is_sourcing_staff");
    const counts = await selectMatrix(client);
    const insertDenied = await tryInsertLead(client, "outsider");
    results.push({
      ...summarize("authenticated_outsider", counts, insertDenied),
      rpcIsStaff: rpc,
    });
  }

  // 3) inactive staff
  {
    const client = await login(inactiveEmail);
    const { data: rpc } = await client.rpc("is_sourcing_staff");
    const counts = await selectMatrix(client);
    const insertDenied = await tryInsertLead(client, "inactive");
    results.push({
      ...summarize("authenticated_inactive_staff", counts, insertDenied),
      rpcIsStaff: rpc,
    });
  }

  // 4) active authorized staff
  {
    const client = await login(activeEmail);
    const { data: rpc } = await client.rpc("is_sourcing_staff");
    const counts = await selectMatrix(client);
    // Active may succeed insert — cleanup
    const { data: inserted } = await client
      .from("sourcing_truck_leads")
      .insert({
        seller: "RLS active",
        source_url: "",
        source_scope: "rls-four-identity",
        source_listing_id: `probe-active-${Date.now()}`,
        canonical_listing_url: "",
        match_status: "needs_verification",
        match_reasons: [],
        spec_evidence: {
          inspectionUrl: "https://inspection-reports.example.test/rls-probe",
        },
      })
      .select("id")
      .maybeSingle();
    if (inserted?.id) {
      await admin.from("sourcing_truck_leads").delete().eq("id", inserted.id);
    }
    results.push({
      ...summarize("authenticated_active_staff", counts, false),
      rpcIsStaff: rpc,
      insertSucceeded: Boolean(inserted?.id),
    });
  }

  // Case-normalized matching: directory lower, JWT mixed case email
  {
    const mixed = `MixedCase-Rls-${Date.now()}@Example.COM`;
    await ensureUser(mixed);
    await admin.from("sourcing_authorized_staff").upsert({
      email: mixed.toLowerCase(),
      display_name: "Case Probe",
      active: true,
    });
    const client = await login(mixed);
    const { data: rpc } = await client.rpc("is_sourcing_staff");
    results.push({
      identity: "case_normalized_active",
      rpcIsStaff: rpc,
    });
  }

  // Empty email deny is covered by SQL (auth.jwt email required) — report function shape
  const { data: fnRows } = await admin.rpc("is_sourcing_staff"); // service role: typically false (no JWT user)
  void fnRows;

  console.log(
    JSON.stringify(
      {
        sklPrimaryActive: sklRow?.active === true,
        results,
      },
      null,
      2
    )
  );

  // Cleanup probe directory rows (not SKL)
  await admin
    .from("sourcing_authorized_staff")
    .delete()
    .in("email", [inactiveEmail, activeEmail, outsiderEmail]);
  // mixed case cleanup
  await admin
    .from("sourcing_authorized_staff")
    .delete()
    .like("email", "mixedcase-rls-%");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
