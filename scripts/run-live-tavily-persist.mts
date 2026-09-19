/**
 * Live Tavily run + persist to local Supabase via service role (no browser).
 * Caps credits via existing Tavily provider. Never prints API keys.
 */
import Module from "node:module";
import { createClient } from "@supabase/supabase-js";

const originalLoad = (Module as unknown as { _load: Function })._load;
(Module as unknown as { _load: Function })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "server-only") return {};
  return originalLoad(request, parent, isMain);
};

async function main() {
  if (!process.env.TAVILY_API_KEY?.trim()) {
    console.error("TAVILY_API_KEY missing");
    process.exit(2);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { runTavilySearch } = await import("../src/lib/sourcing/search/providers/tavily.ts");
  const { candidateToTruckLeadInput, candidateToContactInput } = await import(
    "../src/lib/sourcing/search/map-candidates.ts"
  );
  const { findExistingLead, planIntakeRow } = await import("../src/lib/sourcing/intake/import.ts");
  const { classifyLead } = await import("../src/lib/sourcing/match.ts");
  const { truckLeadInputToRow, rowToTruckLead, supplierContactInputToRow } = await import(
    "../src/lib/sourcing/mappers.ts"
  );
  const { getBuyingProfile } = await import("../src/lib/sourcing/db.ts");

  // getBuyingProfile uses anon/server client — load profile directly
  const { data: profileRow } = await supabase
    .from("sourcing_buying_profile")
    .select("*")
    .limit(1)
    .maybeSingle();

  const { DEFAULT_BUYING_PROFILE } = await import("../src/types/sourcing.ts");
  const profile = profileRow
    ? {
        ...DEFAULT_BUYING_PROFILE,
        id: profileRow.id,
        requireCummins: profileRow.require_cummins,
        requireAutomatic: profileRow.require_automatic,
        requiredBoxLengthsFt: profileRow.required_box_lengths_ft,
        maxGvwrLbs: profileRow.max_gvwr_lbs,
        gvwrMustBeStrictlyBelow: profileRow.gvwr_must_be_strictly_below,
        maxMileage: profileRow.max_mileage,
        maxAgeYears: profileRow.max_age_years,
        preferLiftgate: profileRow.prefer_liftgate,
        preferredMaxDrivingMiles: profileRow.preferred_max_driving_miles,
        maxPrice: profileRow.max_price,
        originLabel: profileRow.origin_label,
        notes: profileRow.notes ?? "",
      }
    : DEFAULT_BUYING_PROFILE;

  const { data: existingRows } = await supabase.from("sourcing_truck_leads").select("*");
  const existingLeads = (existingRows || []).map(rowToTruckLead);

  console.log("=== Live Tavily persist ===");
  const search = await runTavilySearch(profile);
  console.log(
    JSON.stringify(
      {
        provider: search.usage.provider,
        credits: search.usage.creditsConsumed,
        searches: search.usage.searchesRun,
        extracts: search.usage.extractsRun,
        trucksRaw: search.payload.trucks.length,
        contactsRaw: search.payload.contacts.length,
      },
      null,
      2
    )
  );

  const report = {
    status: "completed" as const,
    generatedAt: new Date().toISOString(),
    buyingProfile: profile,
    queriesExecuted: search.payload.queriesUsed,
    sourcesSearched: search.payload.sourcesConsulted,
    resultsExamined: search.payload.trucks.length + search.payload.contacts.length,
    newLeadsSaved: 0,
    confirmedMatches: 0,
    needsVerification: 0,
    duplicatesOrRejected: 0,
    contactsSaved: 0,
    apiUsage: search.usage,
    errors: [] as string[],
    trucksSaved: [] as Array<Record<string, unknown>>,
    contactsFound: [] as Array<Record<string, unknown>>,
  };

  const batch = [...existingLeads];
  const now = new Date();

  for (const truck of search.payload.trucks) {
    const mapped = candidateToTruckLeadInput(truck);
    if (mapped.rejectReason) {
      report.duplicatesOrRejected += 1;
      report.trucksSaved.push({
        seller: truck.seller,
        stockNumber: truck.stockNumber,
        listingUrl: truck.listingUrl,
        matchStatus: "rejected",
        outcome: "rejected",
        reason: mapped.rejectReason,
        phone: truck.phone,
      });
      continue;
    }
    const existing = findExistingLead(batch, mapped.input);
    const plan = planIntakeRow(mapped.input, existing, profile, {
      dateObserved: now.toISOString().slice(0, 10),
      missingEvidence: [],
      now,
    });
    const match = classifyLead(plan.input, profile);
    const row = truckLeadInputToRow({
      ...plan.input,
      matchStatus: match.status,
      matchReasons: match.reasons,
      listingFirstSeenAt: plan.listingFirstSeenAt,
      listingLastSeenAt: plan.listingLastSeenAt,
      listingLastChangedAt: plan.listingLastChangedAt,
    });

    let savedId = plan.existingId;
    if (plan.kind === "inserted") {
      const { data, error } = await supabase.from("sourcing_truck_leads").insert(row).select("id").single();
      if (error) {
        report.duplicatesOrRejected += 1;
        report.trucksSaved.push({
          seller: plan.input.seller,
          stockNumber: plan.input.stockNumber,
          listingUrl: plan.input.sourceUrl,
          matchStatus: match.status,
          outcome: "rejected",
          reason: error.message,
          phone: truck.phone,
        });
        continue;
      }
      savedId = data.id;
      report.newLeadsSaved += 1;
    } else {
      const { error } = await supabase.from("sourcing_truck_leads").update(row).eq("id", plan.existingId!);
      if (error) {
        report.errors.push(error.message);
        continue;
      }
    }
    if (match.status === "confirmed_match") report.confirmedMatches += 1;
    if (match.status === "needs_verification") report.needsVerification += 1;
    report.trucksSaved.push({
      id: savedId,
      seller: plan.input.seller,
      stockNumber: plan.input.stockNumber,
      listingUrl: plan.input.sourceUrl,
      matchStatus: match.status,
      outcome: plan.kind,
      phone: truck.phone,
      year: plan.input.year,
      makeModel: plan.input.makeModel,
      price: plan.input.price,
      location: plan.input.location,
    });
    const synthetic = {
      id: savedId || `tmp-${report.trucksSaved.length}`,
      ...plan.input,
      matchStatus: match.status,
      matchReasons: match.reasons,
      listingFirstSeenAt: plan.listingFirstSeenAt,
      listingLastChangedAt: plan.listingLastChangedAt,
      listingLastSeenAt: plan.listingLastSeenAt,
    };
    if (existing) {
      const idx = batch.findIndex((l) => l.id === existing.id);
      if (idx >= 0) batch[idx] = synthetic as (typeof batch)[0];
    } else {
      batch.push(synthetic as (typeof batch)[0]);
    }
  }

  for (const contact of search.payload.contacts) {
    const mapped = candidateToContactInput(contact);
    if (mapped.rejectReason) {
      report.duplicatesOrRejected += 1;
      report.contactsFound.push({
        company: contact.company,
        phone: contact.phone,
        sourceUrl: contact.sourceUrl,
        outcome: "rejected",
        reason: mapped.rejectReason,
      });
      continue;
    }
    const { data: existingContact } = await supabase
      .from("sourcing_supplier_contacts")
      .select("id")
      .ilike("company", mapped.input.company)
      .limit(1)
      .maybeSingle();
    if (existingContact?.id) {
      report.contactsFound.push({
        company: mapped.input.company,
        phone: mapped.input.phone,
        sourceUrl: mapped.input.sourceUrl,
        outcome: "skipped",
        reason: "Company already in supplier contacts.",
      });
      continue;
    }
    const { error } = await supabase
      .from("sourcing_supplier_contacts")
      .insert(supplierContactInputToRow(mapped.input));
    if (error) {
      report.errors.push(error.message);
      report.contactsFound.push({
        company: mapped.input.company,
        phone: mapped.input.phone,
        sourceUrl: mapped.input.sourceUrl,
        outcome: "rejected",
        reason: error.message,
      });
      continue;
    }
    report.contactsSaved += 1;
    report.contactsFound.push({
      company: mapped.input.company,
      phone: mapped.input.phone,
      sourceUrl: mapped.input.sourceUrl,
      outcome: "inserted",
    });
  }

  if (report.errors.length) report.status = "partial";

  const { data: runRow, error: runErr } = await supabase
    .from("sourcing_search_runs")
    .insert({
      status: report.status,
      buying_profile_snapshot: report.buyingProfile,
      queries: report.queriesExecuted,
      sources_searched: report.sourcesSearched,
      results_examined: report.resultsExamined,
      new_leads: report.newLeadsSaved,
      confirmed_matches: report.confirmedMatches,
      needs_verification: report.needsVerification,
      duplicates_or_rejected: report.duplicatesOrRejected,
      contacts_saved: report.contactsSaved,
      api_usage: report.apiUsage,
      errors: report.errors,
      report,
      created_by_email: "cli-live-pilot",
    })
    .select("id")
    .single();
  if (runErr) console.error("search_run persist:", runErr.message);
  else console.log("search_run_id", runRow.id);

  console.log("\n=== RESULTS ===");
  console.log(
    JSON.stringify(
      {
        credits: report.apiUsage.creditsConsumed,
        newLeadsSaved: report.newLeadsSaved,
        confirmedMatches: report.confirmedMatches,
        needsVerification: report.needsVerification,
        rejected: report.duplicatesOrRejected,
        contactsSaved: report.contactsSaved,
        sources: report.sourcesSearched,
      },
      null,
      2
    )
  );
  console.log("\n--- Trucks kept ---");
  for (const t of report.trucksSaved.filter((x) => x.outcome !== "rejected")) {
    console.log(t);
  }
  console.log("\n--- Trucks rejected ---");
  for (const t of report.trucksSaved.filter((x) => x.outcome === "rejected").slice(0, 10)) {
    console.log({ url: t.listingUrl, reason: t.reason });
  }
  console.log("\n--- Contacts ---");
  for (const c of report.contactsFound) console.log(c);
}

main().catch((e) => {
  console.error(String(e).replace(/tvly-[A-Za-z0-9_-]+/gi, "[redacted]"));
  process.exit(1);
});
