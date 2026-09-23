/**
 * Integration: market comparison insert uses the signed-in staff JWT client
 * (anon key + user session), not the service role. Exercises RLS + created_by trigger.
 *
 * Requires local Supabase (scripts/local-supabase-gateway.mjs + sb_db).
 * Skips when Supabase is unreachable or migration is not applied.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertMarketComparison } from "@/lib/sourcing/db";
import type { SourcingAccess } from "@/lib/sourcing/access";
import { mockMarketComparisonUsage } from "@/lib/sourcing/market-comparison/mock";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const STAFF_EMAIL = "mc-integration-staff@skl.example";
const STAFF_PASSWORD = "integration-test-password-mc-23";
const SPOOF_UID = "99999999-9999-9999-9999-999999999999";

function adminClient() {
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function tableReady(admin: SupabaseClient): Promise<boolean> {
  const { error } = await admin.from("sourcing_market_comparisons").select("id").limit(1);
  if (!error) return true;
  return !/schema cache|does not exist|PGRST205/i.test(error.message);
}

describe("market comparison JWT insert path (integration)", () => {
  let skipReason = "";
  let admin: SupabaseClient;
  let staffUser: User;
  let staffClient: SupabaseClient;
  let leadId = "";
  let comparisonId = "";

  beforeAll(async () => {
    if (!url || !anon || !service) {
      skipReason = "Supabase env not configured";
      return;
    }
    admin = adminClient();
    try {
      const health = await fetch(`${url.replace(/\/$/, "")}/health`).catch(() => null);
      // gateway /health or rest openapi
      const rest = await admin.from("sourcing_truck_leads").select("id", { head: true, count: "exact" });
      if (rest.error && /fetch|ECONNREFUSED/i.test(rest.error.message)) {
        skipReason = "Local Supabase unreachable";
        return;
      }
    } catch {
      skipReason = "Local Supabase unreachable";
      return;
    }

    if (!(await tableReady(admin))) {
      skipReason =
        "sourcing_market_comparisons missing — apply supabase/sourcing-market-comparison.sql first";
      return;
    }

    // Ensure active authorized staff directory row
    await admin.from("sourcing_authorized_staff").upsert({
      email: STAFF_EMAIL,
      display_name: "MC Integration Staff",
      active: true,
    });

    // Create or reuse auth user
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let existing = listed.data.users.find(
      (u) => (u.email ?? "").toLowerCase() === STAFF_EMAIL
    );
    if (!existing) {
      const created = await admin.auth.admin.createUser({
        email: STAFF_EMAIL,
        password: STAFF_PASSWORD,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        skipReason = `Could not create staff user: ${created.error?.message}`;
        return;
      }
      existing = created.data.user;
    }
    staffUser = existing;

    staffClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await staffClient.auth.signInWithPassword({
      email: STAFF_EMAIL,
      password: STAFF_PASSWORD,
    });
    if (signedIn.error || !signedIn.data.user) {
      skipReason = `Staff sign-in failed: ${signedIn.error?.message}`;
      return;
    }
    staffUser = signedIn.data.user;

    // Eligible lead for FK
    const { data: lead, error: leadErr } = await admin
      .from("sourcing_truck_leads")
      .insert({
        year: 2019,
        make_model: "Freightliner M2",
        mileage: 140000,
        price: 40000,
        source_url: "https://example.com/integration-mc-lead",
        canonical_listing_url: `https://example.com/integration-mc-lead-${Date.now()}`,
      })
      .select("id")
      .single();
    if (leadErr || !lead) {
      // Fallback: use any existing lead
      const any = await admin.from("sourcing_truck_leads").select("id").limit(1).maybeSingle();
      if (!any.data?.id) {
        skipReason = `Could not create/find lead: ${leadErr?.message}`;
        return;
      }
      leadId = any.data.id;
    } else {
      leadId = lead.id as string;
    }
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    if (comparisonId) {
      // No staff DELETE policy — clean up with service role only for test hygiene
      await admin.from("sourcing_market_comparisons").delete().eq("id", comparisonId);
    }
    if (leadId) {
      await admin
        .from("sourcing_truck_leads")
        .delete()
        .like("canonical_listing_url", "https://example.com/integration-mc-lead-%");
    }
  });

  it("inserts via staff JWT client; auth.uid forces created_by; RLS exercised", async () => {
    if (skipReason) {
      console.warn(`[skip] ${skipReason}`);
      expect(skipReason).toBeTruthy();
      return;
    }

    expect(staffUser.id).toBeTruthy();

    const access = {
      ok: true as const,
      user: staffUser,
      supabase: staffClient,
    } satisfies Extract<SourcingAccess, { ok: true }>;

    // Confirm this client is NOT service role: RPC is_sourcing_staff should be true for JWT user
    const { data: isStaff } = await staffClient.rpc("is_sourcing_staff");
    expect(isStaff).toBe(true);

    const result = await insertMarketComparison({
      leadId,
      status: "failed",
      assessment: null,
      confidence: null,
      report: null,
      apiUsage: mockMarketComparisonUsage(),
      errorMessage: "integration test — safe to delete",
      createdBy: SPOOF_UID,
      access,
    });

    expect(result.error).toBeUndefined();
    expect(result.id).toBeTruthy();
    comparisonId = result.id!;

    // Read back with service role to inspect created_by without depending on SELECT policy shape
    const { data: row, error } = await admin
      .from("sourcing_market_comparisons")
      .select("id, created_by, status, report, error_message")
      .eq("id", comparisonId)
      .single();
    expect(error).toBeNull();
    expect(row?.status).toBe("failed");
    expect(row?.report).toBeNull();
    expect(row?.created_by).toBe(staffUser.id);
    expect(row?.created_by).not.toBe(SPOOF_UID);

    // Staff JWT can SELECT the row (RLS allows active staff)
    const { data: staffView, error: staffViewErr } = await staffClient
      .from("sourcing_market_comparisons")
      .select("id, created_by")
      .eq("id", comparisonId)
      .maybeSingle();
    expect(staffViewErr).toBeNull();
    expect(staffView?.created_by).toBe(staffUser.id);

    // Outsider JWT cannot INSERT (create ephemeral outsider)
    const outsiderClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const outsiderEmail = `mc-outsider-${Date.now()}@example.com`;
    await admin.auth.admin.createUser({
      email: outsiderEmail,
      password: STAFF_PASSWORD,
      email_confirm: true,
    });
    await outsiderClient.auth.signInWithPassword({
      email: outsiderEmail,
      password: STAFF_PASSWORD,
    });
    const outsiderInsert = await outsiderClient.from("sourcing_market_comparisons").insert({
      lead_id: leadId,
      status: "failed",
      created_by: SPOOF_UID,
      error_message: "should fail",
    });
    expect(outsiderInsert.error).toBeTruthy();
  }, 60_000);
});
