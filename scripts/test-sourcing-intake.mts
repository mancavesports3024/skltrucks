/**
 * Nonprod CSV intake smoke test against local Supabase.
 * Run: node --env-file=.env.local --import tsx scripts/test-sourcing-intake.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_BUYING_PROFILE } from "../src/types/sourcing.ts";
import { buildIntakeBatchFromCsv } from "../src/lib/sourcing/intake/import.ts";
import { classifyLead } from "../src/lib/sourcing/match.ts";
import { truckLeadInputToRow, rowToTruckLead } from "../src/lib/sourcing/mappers.ts";
import type { DbTruckLead } from "../src/lib/sourcing/mappers.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function login() {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "skltrucksllc@gmail.com",
      password: "StaffTestPass123!",
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`login failed: ${JSON.stringify(json)}`);
  return json.access_token as string;
}

async function main() {
  const token = await login();
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: existingRows } = await supabase.from("sourcing_truck_leads").select("*");
  const existing = (existingRows ?? []).map((r) => rowToTruckLead(r as DbTruckLead));

  const day1 = readFileSync("fixtures/sourcing/intake-sample-day1.csv", "utf8");
  const day2 = readFileSync("fixtures/sourcing/intake-sample-day2.csv", "utf8");

  const report1 = buildIntakeBatchFromCsv(day1, existing, DEFAULT_BUYING_PROFILE, {
    sourceLabel: "Penske weekly email → CSV (nonprod pilot)",
    defaultSourceScope: "penske-used-trucks",
    now: new Date("2026-09-18T18:00:00Z"),
  });

  console.log("DAY1", {
    usable: report1.usableLeads,
    inserted: report1.inserted,
    needsVerification: report1.needsVerification,
    staffMustVerify: report1.staffMustVerify,
    errors: report1.errors,
  });

  for (const plan of report1.plans) {
    const match = classifyLead(plan.input, DEFAULT_BUYING_PROFILE);
    const row = truckLeadInputToRow({
      ...plan.input,
      matchStatus: match.status,
      matchReasons: match.reasons,
      listingFirstSeenAt: plan.listingFirstSeenAt,
      listingLastSeenAt: plan.listingLastSeenAt,
      listingLastChangedAt: plan.listingLastChangedAt,
    });
    if (plan.kind === "inserted") {
      const { error } = await supabase.from("sourcing_truck_leads").insert(row);
      if (error) {
        // VIN may already exist from seed — treat as update path
        console.log("insert note:", plan.input.stockNumber, error.message);
        const { data: byVin } = plan.input.vin
          ? await supabase
              .from("sourcing_truck_leads")
              .select("id")
              .eq("vin", plan.input.vin)
              .maybeSingle()
          : { data: null };
        if (byVin?.id) {
          await supabase.from("sourcing_truck_leads").update(row).eq("id", byVin.id);
        }
      }
    }
  }

  const { data: after1Rows } = await supabase.from("sourcing_truck_leads").select("*");
  const after1 = (after1Rows ?? []).map((r) => rowToTruckLead(r as DbTruckLead));

  const report2 = buildIntakeBatchFromCsv(day2, after1, DEFAULT_BUYING_PROFILE, {
    sourceLabel: "Penske weekly email → CSV (nonprod pilot)",
    now: new Date("2026-09-19T18:00:00Z"),
  });

  console.log("DAY2", {
    usable: report2.usableLeads,
    inserted: report2.inserted,
    listingChanges: report2.listingChanges,
    seenAgain: report2.seenAgain,
    needsVerification: report2.needsVerification,
    staffMustVerify: report2.staffMustVerify,
  });

  for (const plan of report2.plans) {
    const match = classifyLead(plan.input, DEFAULT_BUYING_PROFILE);
    const row = truckLeadInputToRow({
      ...plan.input,
      matchStatus: match.status,
      matchReasons: match.reasons,
      listingFirstSeenAt: plan.listingFirstSeenAt,
      listingLastSeenAt: plan.listingLastSeenAt,
      listingLastChangedAt: plan.listingLastChangedAt,
    });
    if (plan.existingId) {
      const { error } = await supabase
        .from("sourcing_truck_leads")
        .update(row)
        .eq("id", plan.existingId);
      if (error) console.log("update error", error.message);
    }
  }

  // Source failure check
  const fail = buildIntakeBatchFromCsv(null, [], DEFAULT_BUYING_PROFILE);
  console.log("SOURCE_FAILURE", fail.parseError, "usable", fail.usableLeads);

  const { data: penske } = await supabase
    .from("sourcing_truck_leads")
    .select("stock_number,price,listing_first_seen_at,listing_last_changed_at,listing_last_seen_at,match_status,spec_evidence")
    .eq("source_scope", "penske-used-trucks")
    .order("stock_number");
  console.log("PENSKE_ROWS", JSON.stringify(penske, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
