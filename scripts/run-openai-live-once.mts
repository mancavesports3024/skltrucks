/**
 * Exactly one controlled OpenAI live Internet Search Pilot.
 * Forces OpenAI provider — refuses Tavily and mock.
 * Never prints API key values.
 */
import Module from "node:module";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const originalLoad = (Module as unknown as { _load: Function })._load;
(Module as unknown as { _load: Function })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "server-only") return {};
  return originalLoad(request, parent, isMain);
};

function redact(s: string): string {
  return s
    .replace(/tvly-[A-Za-z0-9_-]+/gi, "[redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/gi, "[redacted]");
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const host = new URL(supabaseUrl).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    console.error("REFUSE: Supabase is not local nonprod.");
    process.exit(2);
  }

  const prefer = (process.env.SOURCING_SEARCH_PROVIDER || "").trim().toLowerCase();
  if (prefer !== "openai") {
    console.error("REFUSE: SOURCING_SEARCH_PROVIDER must be openai (got: " + (prefer || "unset") + ")");
    process.exit(2);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("REFUSE: OPENAI_API_KEY missing.");
    process.exit(2);
  }

  const { resolveSearchProviderId } = await import(
    "../src/lib/sourcing/search/providers/index.ts"
  );
  const { runOpenAiProviderSearch, isOpenAiSearchConfigured } = await import(
    "../src/lib/sourcing/search/providers/openai.ts"
  );
  const { isTavilyConfigured } = await import(
    "../src/lib/sourcing/search/providers/tavily.ts"
  );
  const { candidateToTruckLeadInput, candidateToContactInput } = await import(
    "../src/lib/sourcing/search/map-candidates.ts"
  );
  const { findExistingLead, planIntakeRow } = await import(
    "../src/lib/sourcing/intake/import.ts"
  );
  const { classifyLead } = await import("../src/lib/sourcing/match.ts");
  const { truckLeadInputToRow, rowToTruckLead, supplierContactInputToRow } =
    await import("../src/lib/sourcing/mappers.ts");
  const { DEFAULT_BUYING_PROFILE } = await import("../src/types/sourcing.ts");

  const resolved = resolveSearchProviderId({ prefer: "openai", forceMock: false });
  console.log("=== PREFLIGHT (safe) ===");
  console.log(
    JSON.stringify(
      {
        supabase_host: host + (new URL(supabaseUrl).port ? ":" + new URL(supabaseUrl).port : ""),
        nonprod_local: true,
        SOURCING_SEARCH_PROVIDER: prefer,
        openai_configured: isOpenAiSearchConfigured(),
        tavily_configured: isTavilyConfigured(),
        resolved_provider: resolved,
        falls_back_to_tavily: resolved === "tavily",
        model:
          process.env.OPENAI_SEARCH_MODEL?.trim() || "gpt-4o-mini",
        max_tool_calls: Number(process.env.OPENAI_SEARCH_MAX_TOOL_CALLS || "6"),
      },
      null,
      2
    )
  );

  if (resolved !== "openai") {
    console.error("REFUSE: resolved provider is not openai (" + resolved + ")");
    process.exit(2);
  }

  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: profileRow } = await supabase
    .from("sourcing_buying_profile")
    .select("*")
    .limit(1)
    .maybeSingle();

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

  console.log("\n=== ACTIVE BUYING PROFILE ===");
  console.log(
    JSON.stringify(
      {
        requireCummins: profile.requireCummins,
        requireAutomatic: profile.requireAutomatic,
        requiredBoxLengthsFt: profile.requiredBoxLengthsFt,
        maxGvwrLbs: profile.maxGvwrLbs,
        gvwrMustBeStrictlyBelow: profile.gvwrMustBeStrictlyBelow,
        maxMileage: profile.maxMileage,
        maxAgeYears: profile.maxAgeYears,
        preferLiftgate: profile.preferLiftgate,
        preferredMaxDrivingMiles: profile.preferredMaxDrivingMiles,
        maxPrice: profile.maxPrice,
        originLabel: profile.originLabel,
      },
      null,
      2
    )
  );

  const { data: existingRows } = await supabase.from("sourcing_truck_leads").select("*");
  const existingLeads = (existingRows || []).map(rowToTruckLead);

  console.log("\n=== LIVE OPENAI RUN (not mock, not Tavily) ===");
  // Call OpenAI provider directly — bypasses any Tavily preference path.
  let search;
  try {
    search = await runOpenAiProviderSearch(profile);
  } catch (e) {
    console.error("OpenAI provider failed:", redact(e instanceof Error ? (e.stack || e.message) : String(e)));
    process.exit(1);
  }

  if (search.provider !== "openai" || !search.usage.live || search.usage.provider === "mock") {
    console.error("REFUSE: result was not a live OpenAI run.");
    process.exit(2);
  }
  if (search.payload.notes?.includes("Mock payload")) {
    console.error("REFUSE: mock fixtures detected in payload.");
    process.exit(2);
  }

  const report: Record<string, unknown> = {
    status: "completed",
    generatedAt: new Date().toISOString(),
    buyingProfile: profile,
    queriesExecuted: search.payload.queriesUsed.length
      ? search.payload.queriesUsed
      : search.queriesPlanned,
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
    detailedResults: [] as Array<Record<string, unknown>>,
  };

  const batch = [...existingLeads];
  const now = new Date();

  for (const truck of search.payload.trucks) {
    try {
    const mapped = candidateToTruckLeadInput(truck);
    const detail: Record<string, unknown> = {
      listingUrl: truck.listingUrl,
      appearsCurrentlyAvailable: "unknown_not_verified_beyond_listing_text",
      seller: truck.seller || truck.sourceName,
      phone: truck.phone || null,
      contactName: truck.contactName || null,
      contactRole: truck.contactRole || null,
      year: truck.year,
      makeModel: truck.makeModel,
      engine: truck.engine,
      engineIsCummins: truck.engineIsCummins,
      engineEvidence: truck.engineEvidence || null,
      transmission: truck.transmission,
      transmissionIsAutomatic: truck.transmissionIsAutomatic,
      transmissionEvidence: truck.transmissionEvidence || null,
      boxLengthFt: truck.boxLengthFt,
      boxLengthEvidence: truck.boxLengthEvidence || null,
      manufacturerGvwrLbs: truck.manufacturerGvwrLbs,
      listedWeightLbs: truck.listedWeightLbs,
      listedWeightTerm: truck.listedWeightTerm,
      gvwrEvidence: truck.gvwrEvidence || null,
      mileage: truck.mileage,
      hasLiftgate: truck.hasLiftgate,
      askingPrice: truck.askingPrice,
      auctionCurrentBid: truck.auctionCurrentBid,
      location: truck.location,
      drivingDistanceMiles: truck.drivingDistanceMiles,
      distanceIsEstimate: truck.distanceIsEstimate,
      evidenceUrl: truck.evidenceUrl || truck.listingUrl,
      notes: truck.notes || null,
      stockNumber: truck.stockNumber || null,
      vin: truck.vin || null,
    };

    if (mapped.rejectReason) {
      (report.duplicatesOrRejected as number) += 1;
      detail.classification = "Rejected";
      detail.reason = mapped.rejectReason;
      detail.outcome = "rejected";
      (report.detailedResults as Array<Record<string, unknown>>).push(detail);
      (report.trucksSaved as Array<Record<string, unknown>>).push({
        seller: truck.seller,
        stockNumber: truck.stockNumber,
        listingUrl: truck.listingUrl,
        matchStatus: "rejected",
        outcome: "rejected",
        reason: mapped.rejectReason,
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
      const { data, error } = await supabase
        .from("sourcing_truck_leads")
        .insert(row)
        .select("id")
        .single();
      if (error) {
        (report.duplicatesOrRejected as number) += 1;
        detail.classification = "Rejected";
        detail.reason = error.message;
        detail.outcome = "rejected";
        if (/duplicate|unique/i.test(error.message)) detail.duplicate = true;
        (report.detailedResults as Array<Record<string, unknown>>).push(detail);
        continue;
      }
      savedId = data.id;
      (report.newLeadsSaved as number) += 1;
    } else {
      const { error } = await supabase
        .from("sourcing_truck_leads")
        .update(row)
        .eq("id", plan.existingId!);
      if (error) {
        (report.errors as string[]).push(error.message);
        detail.classification = match.status;
        detail.reason = error.message;
        detail.outcome = plan.kind;
        (report.detailedResults as Array<Record<string, unknown>>).push(detail);
        continue;
      }
      if (plan.kind === "seen_again" || plan.kind === "listing_change") {
        detail.duplicateOrPreviouslySeen = plan.kind;
      }
    }

    if (match.status === "confirmed_match") (report.confirmedMatches as number) += 1;
    if (match.status === "needs_verification") (report.needsVerification as number) += 1;

    const label =
      match.status === "confirmed_match"
        ? "Confirmed match"
        : match.status === "needs_verification"
          ? "Needs verification"
          : match.status === "does_not_match"
            ? "Rejected (does not match)"
            : match.status;

    detail.classification = label;
    detail.matchReasons = match.reasons;
    detail.outcome = plan.kind;
    detail.gatedSpecEvidence = plan.input.specEvidence;
    detail.missingRequiredReason = match.reasons
      .filter((r) => r.outcome === "unknown" || r.outcome === "fail")
      .map((r) => `${r.constraint}: ${r.note || r.outcome}`);

    (report.detailedResults as Array<Record<string, unknown>>).push(detail);
    (report.trucksSaved as Array<Record<string, unknown>>).push({
      id: savedId,
      seller: plan.input.seller,
      stockNumber: plan.input.stockNumber,
      listingUrl: plan.input.sourceUrl,
      matchStatus: match.status,
      outcome: plan.kind,
      phone: truck.phone,
    });

    const synthetic = {
      id: savedId || `tmp-${(report.trucksSaved as unknown[]).length}`,
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
    } catch (e) {
      (report.duplicatesOrRejected as number) += 1;
      (report.errors as string[]).push(redact(e instanceof Error ? e.message : String(e)));
      (report.detailedResults as Array<Record<string, unknown>>).push({
        listingUrl: truck?.listingUrl || null,
        seller: truck?.seller || truck?.sourceName || null,
        classification: "Rejected",
        reason: redact(e instanceof Error ? e.message : String(e)),
        outcome: "rejected",
      });
    }
  }

  for (const contact of search.payload.contacts) {
    const mapped = candidateToContactInput(contact);
    if (mapped.rejectReason) {
      (report.duplicatesOrRejected as number) += 1;
      (report.contactsFound as Array<Record<string, unknown>>).push({
        company: contact.company,
        phone: contact.phone || null,
        contactName: contact.contactName || null,
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
      (report.contactsFound as Array<Record<string, unknown>>).push({
        company: mapped.input.company,
        phone: mapped.input.phone,
        contactName: mapped.input.contactName || null,
        sourceUrl: mapped.input.sourceUrl,
        outcome: "skipped_duplicate_company",
        reason: "Company already in supplier contacts.",
      });
      continue;
    }
    const { error } = await supabase
      .from("sourcing_supplier_contacts")
      .insert(supplierContactInputToRow(mapped.input));
    if (error) {
      (report.errors as string[]).push(error.message);
      (report.contactsFound as Array<Record<string, unknown>>).push({
        company: mapped.input.company,
        phone: mapped.input.phone,
        sourceUrl: mapped.input.sourceUrl,
        outcome: "rejected",
        reason: error.message,
      });
      continue;
    }
    (report.contactsSaved as number) += 1;
    (report.contactsFound as Array<Record<string, unknown>>).push({
      company: mapped.input.company,
      phone: mapped.input.phone,
      contactName: mapped.input.contactName || null,
      role: mapped.input.role || null,
      sourceUrl: mapped.input.sourceUrl,
      evidenceQuote: contact.evidenceQuote || null,
      outcome: "inserted",
    });
  }

  if ((report.errors as string[]).length) report.status = "partial";

  await supabase.from("sourcing_search_runs").insert({
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
    created_by_email: "cli-openai-live-pilot",
  });

  const outPath = "/opt/cursor/artifacts/openai-live-search-report.json";
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("\n=== REPORT SAVED ===");
  console.log(outPath);
  console.log(redact(JSON.stringify({
    provider: search.usage.provider,
    live: search.usage.live,
    model: search.usage.model,
    webSearchCalls: search.usage.webSearchCalls,
    inputTokens: search.usage.inputTokens,
    outputTokens: search.usage.outputTokens,
    estimatedCostUsd: search.usage.estimatedCostUsd,
    queriesExecuted: report.queriesExecuted,
    sourcesSearched: report.sourcesSearched,
    resultsExamined: report.resultsExamined,
    newLeadsSaved: report.newLeadsSaved,
    confirmedMatches: report.confirmedMatches,
    needsVerification: report.needsVerification,
    duplicatesOrRejected: report.duplicatesOrRejected,
    contactsSaved: report.contactsSaved,
    trucks: report.detailedResults,
    contacts: report.contactsFound,
    providerNotes: search.payload.notes,
  }, null, 2)));
}

main().catch((e) => {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
