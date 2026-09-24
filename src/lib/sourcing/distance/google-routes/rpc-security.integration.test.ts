/**
 * Local nonproduction security matrix for merge_sourcing_lead_driving_route.
 * Never prints secrets. Skips when Supabase env is missing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildDrivingRouteCache } from "@/lib/sourcing/distance/google-routes/cache";
import { normalizeSpecEvidence } from "@/lib/sourcing/intake/sources";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const configured = Boolean(url && anonKey && serviceKey);

const PGHOST = process.env.PGHOST || "127.0.0.1";
const PGPORT = process.env.PGPORT || "54322";
const PGUSER = process.env.PGUSER || "postgres";
const PGPASSWORD = process.env.PGPASSWORD || "postgres";
const PGDATABASE = process.env.PGDATABASE || "postgres";

function applySql(sql: string) {
  const tmp = join(tmpdir(), `skl-rpc-sec-${Date.now()}.sql`);
  writeFileSync(tmp, sql, "utf8");
  try {
    execFileSync(
      "psql",
      ["-h", PGHOST, "-p", String(PGPORT), "-U", PGUSER, "-d", PGDATABASE, "-v", "ON_ERROR_STOP=1", "-f", tmp],
      { env: { ...process.env, PGPASSWORD }, stdio: ["ignore", "pipe", "pipe"] }
    );
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function validCache() {
  return buildDrivingRouteCache({
    distanceMeters: 160 * 1609.344,
    durationSeconds: 9000,
    destLat: 39.12515,
    destLng: -94.55031,
  });
}

describe.skipIf(!configured)("merge_sourcing_lead_driving_route security", () => {
  let service: SupabaseClient;
  let anon: SupabaseClient;
  let admin: SupabaseClient;
  let leadId: string | null = null;
  const email = `rpc-sec-admin-${Date.now()}@example.com`;
  const password = "RpcSecTest-Local-Only-1!";
  const listingChanged = "2024-06-01T15:30:00.000Z";

  beforeAll(async () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/sourcing-mc-driving-distance-required.sql"),
      "utf8"
    );
    applySql(sql);
    applySql(sql);
    execFileSync(
      "psql",
      [
        "-h",
        PGHOST,
        "-p",
        String(PGPORT),
        "-U",
        PGUSER,
        "-d",
        PGDATABASE,
        "-c",
        "NOTIFY pgrst, 'reload schema';",
      ],
      { env: { ...process.env, PGPASSWORD }, stdio: ["ignore", "pipe", "pipe"] }
    );

    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error && !/already/i.test(created.error.message)) {
      throw created.error;
    }

    admin = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signed = await admin.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;

    const evidence = {
      engine: "Cummins",
      transmission: "Auto",
      boxLength: "26",
      gvwr: "25999",
      inspectionUrl: "https://example.com/inspection/rpc-sec-token",
      country: "United States",
      distance: "Estimated straight-line distance: 142 mi",
      workbookStatus: "Not Started",
    };
    const { data, error } = await service
      .from("sourcing_truck_leads")
      .insert({
        seller: "RPC Sec Test",
        source_url: "https://example.com/rpc-sec",
        source_scope: "rpc-sec",
        source_listing_id: `rpc-sec-${Date.now()}`,
        make_model: "Isuzu NPR",
        year: 2018,
        location: "Kansas City, MO",
        driving_distance_miles: 142,
        distance_is_estimate: true,
        listing_last_changed_at: listingChanged,
        spec_evidence: evidence,
        match_status: "needs_verification",
        match_reasons: [],
      })
      .select("id")
      .single();
    if (error) throw error;
    leadId = data.id;
  });

  afterAll(async () => {
    if (leadId) {
      await service.from("sourcing_truck_leads").delete().eq("id", leadId);
    }
    const listed = await service.auth.admin.listUsers({ perPage: 200 });
    const user = listed.data?.users?.find((u) => u.email === email);
    if (user) await service.auth.admin.deleteUser(user.id);
  });

  it("REVOKE: anon / public cannot execute; authenticated can; SECURITY INVOKER", () => {
    const stdout = execFileSync(
      "psql",
      [
        "-h",
        PGHOST,
        "-p",
        String(PGPORT),
        "-U",
        PGUSER,
        "-d",
        PGDATABASE,
        "-t",
        "-A",
        "-F",
        ",",
        "-c",
        `select
           has_function_privilege('anon', 'public.merge_sourcing_lead_driving_route(uuid,jsonb)', 'execute'),
           has_function_privilege('authenticated', 'public.merge_sourcing_lead_driving_route(uuid,jsonb)', 'execute'),
           has_function_privilege('public', 'public.merge_sourcing_lead_driving_route(uuid,jsonb)', 'execute'),
           (select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='merge_sourcing_lead_driving_route' limit 1);
        `,
      ],
      { env: { ...process.env, PGPASSWORD }, encoding: "utf8" }
    );
    const [anonExec, authExec, publicExec, isDefiner] = String(stdout).trim().split(",");
    expect(anonExec).toBe("f");
    expect(publicExec).toBe("f");
    expect(authExec).toBe("t");
    expect(isDefiner).toBe("f"); // SECURITY INVOKER (prosecdef = false)
  });

  it("signed-out / anon RPC is denied", async () => {
    const { data, error } = await anon.rpc("merge_sourcing_lead_driving_route", {
      p_lead_id: leadId,
      p_driving_route: validCache(),
    });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it("authenticated Admin can merge; preserves evidence; listing_last_changed_at unchanged", async () => {
    const { data, error } = await admin.rpc("merge_sourcing_lead_driving_route", {
      p_lead_id: leadId,
      p_driving_route: validCache(),
    });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row).toBeTruthy();
    const ev = normalizeSpecEvidence(row.spec_evidence);
    expect(ev.inspectionUrl).toBe("https://example.com/inspection/rpc-sec-token");
    expect(ev.engine).toBe("Cummins");
    expect(ev.transmission).toBe("Auto");
    expect(ev.boxLength).toBe("26");
    expect(ev.gvwr).toBe("25999");
    expect(ev.country).toBe("United States");
    expect(ev.workbookStatus).toBe("Not Started");
    expect(ev.distance).toContain("straight-line");
    expect(ev.drivingRoute?.provider).toBe("google_routes");
    expect(row.driving_distance_miles).toBe(142);
    expect(new Date(row.listing_last_changed_at).toISOString()).toBe(listingChanged);
    // Only drivingRoute key added — other columns untouched
    expect(row.seller).toBe("RPC Sec Test");
    expect(row.match_status).toBe("needs_verification");
  });

  it("rejects null, array, string, missing fields, oversized, nonexistent lead", async () => {
    const bad = [
      { p_lead_id: leadId, p_driving_route: null },
      { p_lead_id: leadId, p_driving_route: ["not", "object"] },
      { p_lead_id: leadId, p_driving_route: "string" },
      { p_lead_id: leadId, p_driving_route: { version: "x" } },
      {
        p_lead_id: leadId,
        p_driving_route: { ...validCache(), pad: "x".repeat(9000) },
      },
      {
        p_lead_id: "00000000-0000-0000-0000-000000000000",
        p_driving_route: validCache(),
      },
    ];
    for (const args of bad) {
      const { error } = await admin.rpc("merge_sourcing_lead_driving_route", args);
      expect(error).toBeTruthy();
    }
  });
});
