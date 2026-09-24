/**
 * Local nonproduction integration: required SQL + profile persistence + drivingRoute merge.
 * Skips when Supabase is not configured.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildDrivingRouteCache } from "@/lib/sourcing/distance/google-routes/cache";
import { normalizeSpecEvidence } from "@/lib/sourcing/intake/sources";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const configured = Boolean(url && serviceKey && !url.includes("example"));

const PGHOST = process.env.PGHOST || "127.0.0.1";
const PGPORT = process.env.PGPORT || "54322";
const PGUSER = process.env.PGUSER || "postgres";
const PGPASSWORD = process.env.PGPASSWORD || "postgres";
const PGDATABASE = process.env.PGDATABASE || "postgres";

function applySqlFile(sql: string) {
  const tmp = join(tmpdir(), `skl-mc-sql-${Date.now()}.sql`);
  writeFileSync(tmp, sql, "utf8");
  try {
    execFileSync(
      "psql",
      ["-h", PGHOST, "-p", String(PGPORT), "-U", PGUSER, "-d", PGDATABASE, "-v", "ON_ERROR_STOP=1", "-f", tmp],
      {
        env: { ...process.env, PGPASSWORD },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

describe.skipIf(!configured)("MC driving-distance required SQL + persistence", () => {
  let service: SupabaseClient;
  let leadId: string | null = null;
  const sqlPath = join(process.cwd(), "supabase/sourcing-mc-driving-distance-required.sql");
  const sql = readFileSync(sqlPath, "utf8");

  beforeAll(() => {
    service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (leadId) {
      await service.from("sourcing_truck_leads").delete().eq("id", leadId);
    }
  });

  it("applies required SQL twice (idempotent)", () => {
    applySqlFile(sql);
    applySqlFile(sql);
  });

  it("existing profile receives defaults; staff edits persist on reload", async () => {
    const { data: before, error: beforeErr } = await service
      .from("sourcing_buying_profile")
      .select("transportation_rate_per_mile, default_inspection_cost, preferred_max_driving_miles")
      .eq("id", "default")
      .maybeSingle();
    expect(beforeErr).toBeNull();
    expect(Number(before?.transportation_rate_per_mile ?? 2.25)).toBeGreaterThanOrEqual(0);
    expect(Number(before?.default_inspection_cost ?? 230)).toBeGreaterThanOrEqual(0);

    const rate = 3.5;
    const inspection = 275.5;
    const { error: upErr } = await service.from("sourcing_buying_profile").upsert({
      id: "default",
      require_cummins: DEFAULT_BUYING_PROFILE.requireCummins,
      require_automatic: DEFAULT_BUYING_PROFILE.requireAutomatic,
      required_box_lengths_ft: DEFAULT_BUYING_PROFILE.requiredBoxLengthsFt,
      max_gvwr_lbs: DEFAULT_BUYING_PROFILE.maxGvwrLbs,
      gvwr_must_be_strictly_below: DEFAULT_BUYING_PROFILE.gvwrMustBeStrictlyBelow,
      max_mileage: DEFAULT_BUYING_PROFILE.maxMileage,
      max_age_years: DEFAULT_BUYING_PROFILE.maxAgeYears,
      prefer_liftgate: DEFAULT_BUYING_PROFILE.preferLiftgate,
      preferred_max_driving_miles: DEFAULT_BUYING_PROFILE.preferredMaxDrivingMiles,
      max_price: DEFAULT_BUYING_PROFILE.maxPrice,
      origin_label: DEFAULT_BUYING_PROFILE.originLabel,
      notes: DEFAULT_BUYING_PROFILE.notes,
      transportation_rate_per_mile: rate,
      default_inspection_cost: inspection,
    });
    expect(upErr).toBeNull();

    const { data, error } = await service
      .from("sourcing_buying_profile")
      .select("transportation_rate_per_mile, default_inspection_cost, preferred_max_driving_miles")
      .eq("id", "default")
      .single();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(Number(data!.transportation_rate_per_mile)).toBe(3.5);
    expect(Number(data!.default_inspection_cost)).toBe(275.5);
    expect(Number(data!.preferred_max_driving_miles)).toBe(1200);

    // Re-apply migration must not overwrite staff values.
    applySqlFile(sql);
    const { data: afterMig } = await service
      .from("sourcing_buying_profile")
      .select("transportation_rate_per_mile, default_inspection_cost")
      .eq("id", "default")
      .single();
    expect(Number(afterMig?.transportation_rate_per_mile)).toBe(3.5);
    expect(Number(afterMig?.default_inspection_cost)).toBe(275.5);

    await service
      .from("sourcing_buying_profile")
      .update({
        transportation_rate_per_mile: 2.25,
        default_inspection_cost: 230,
      })
      .eq("id", "default");
  });

  it("merge RPC preserves unrelated spec_evidence keys and listing_last_changed_at", async () => {
    const listingChanged = "2024-01-15T12:00:00.000Z";
    const evidence = {
      engine: "Cummins ISB",
      transmission: "Allison auto",
      boxLength: "26 ft",
      gvwr: "25999",
      inspectionUrl: "https://example.com/inspection/private-token",
      hyperlinkSource: "workbook_unit_cell",
      workbookStatus: "75% COMPLETE",
      country: "United States",
      distance: "Estimated straight-line distance: 142 mi",
    };
    const { data: inserted, error: insErr } = await service
      .from("sourcing_truck_leads")
      .insert({
        seller: "MC Persist Test",
        source_url: "https://example.com/mc-persist-test",
        source_scope: "mc-persist-test",
        source_listing_id: `mc-${Date.now()}`,
        make_model: "Freightliner M2",
        year: 2019,
        location: "Kansas City, MO",
        driving_distance_miles: 142,
        distance_is_estimate: true,
        listing_last_changed_at: listingChanged,
        spec_evidence: evidence,
        match_status: "needs_verification",
        match_reasons: [],
      })
      .select("*")
      .single();
    expect(insErr).toBeNull();
    leadId = inserted!.id as string;

    const cache = buildDrivingRouteCache({
      distanceMeters: 160 * 1609.344,
      durationSeconds: 9000,
      destLat: 39.12515,
      destLng: -94.55031,
    });

    const { data: merged, error: mergeErr } = await service.rpc(
      "merge_sourcing_lead_driving_route",
      { p_lead_id: leadId, p_driving_route: cache }
    );
    expect(mergeErr).toBeNull();
    const row = Array.isArray(merged) ? merged[0] : merged;
    expect(row).toBeTruthy();

    const normalized = normalizeSpecEvidence(row.spec_evidence);
    expect(normalized.inspectionUrl).toBe(evidence.inspectionUrl);
    expect(normalized.engine).toBe(evidence.engine);
    expect(normalized.transmission).toBe(evidence.transmission);
    expect(normalized.boxLength).toBe(evidence.boxLength);
    expect(normalized.gvwr).toBe(evidence.gvwr);
    expect(normalized.workbookStatus).toBe(evidence.workbookStatus);
    expect(normalized.country).toBe(evidence.country);
    expect(normalized.distance).toContain("straight-line");
    expect(normalized.drivingRoute?.distanceMiles).toBeCloseTo(160, 5);

    expect(row.driving_distance_miles).toBe(142);
    expect(row.distance_is_estimate).toBe(true);
    expect(new Date(row.listing_last_changed_at).toISOString()).toBe(listingChanged);
  });
});
