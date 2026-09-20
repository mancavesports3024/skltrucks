import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSourcingStaff } from "@/lib/sourcing/access";
import { findExistingLead, planIntakeRow } from "@/lib/sourcing/intake/import";
import { classifyLead } from "@/lib/sourcing/match";
import {
  findUnambiguousContactMatch,
  formatDatabaseInsertFailure,
  preferSellerDisplayName,
  type LinkableContact,
} from "@/lib/sourcing/search/link-contact";
import {
  candidateToContactInput,
  candidateToTruckLeadInput,
} from "@/lib/sourcing/search/map-candidates";
import {
  resolveSearchProviderId,
  runInternetSearch,
} from "@/lib/sourcing/search/providers";
import {
  buildFailedSearchReport,
} from "@/lib/sourcing/search/provider-error";
import {
  resolveSearchLockStore,
  SEARCH_ALREADY_RUNNING_MESSAGE,
  type SearchLockStore,
} from "@/lib/sourcing/search/search-lock";
import type { SearchRunReport } from "@/lib/sourcing/search/types";
import {
  getBuyingProfile,
  getSupplierContacts,
  getTruckLeads,
  upsertSupplierContact,
} from "@/lib/sourcing/db";
import { truckLeadInputToRow } from "@/lib/sourcing/mappers";
import type { BuyingProfile, TruckLead } from "@/types/sourcing";
import type { SearchProviderResult } from "@/lib/sourcing/search/providers/types";

/**
 * Acquire the single-flight search lock, run the provider, always release.
 * Blocked attempts make zero provider calls.
 */
export async function runProviderSearchWithLock(options: {
  lock: SearchLockStore;
  holderEmail: string;
  runSearch: () => Promise<SearchProviderResult>;
}): Promise<{ error?: string; search?: SearchProviderResult }> {
  const acquired = await options.lock.tryAcquire(options.holderEmail);
  if (!acquired.ok) {
    return {
      error:
        acquired.reason === "already_running"
          ? SEARCH_ALREADY_RUNNING_MESSAGE
          : acquired.message || SEARCH_ALREADY_RUNNING_MESSAGE,
    };
  }
  try {
    const search = await options.runSearch();
    return { search };
  } finally {
    await options.lock.release(options.holderEmail);
  }
}

/**
 * Execute one internet search pilot run (no cron).
 * Uses DB buying profile + resolved provider (Tavily → OpenAI → mock).
 * Acquires a single-flight lock before any provider call.
 */
export async function executeInternetSearchPilot(options?: {
  forceMock?: boolean;
  /** Test-only lock store override (also via setSearchLockStoreForTests). */
  lockStore?: SearchLockStore;
  /** Test-only provider runner override. */
  runSearch?: (
    profile: BuyingProfile,
    opts?: { forceMock?: boolean }
  ) => Promise<SearchProviderResult>;
}): Promise<{ error?: string; report?: SearchRunReport }> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const profile = await getBuyingProfile();
  const existingLeads = await getTruckLeads();
  const existingContacts = await getSupplierContacts();

  const lock = options?.lockStore ?? resolveSearchLockStore(access.supabase);
  const holderEmail = access.user.email ?? "";

  // Resolve provider before any network call so failure reports never hardcode mock.
  const resolvedProviderId = resolveSearchProviderId({
    forceMock: options?.forceMock,
  });
  const resolvedModel =
    resolvedProviderId === "openai"
      ? process.env.OPENAI_SEARCH_MODEL?.trim() || "gpt-4o-mini"
      : resolvedProviderId === "tavily"
        ? "tavily"
        : "mock";

  let search: SearchProviderResult;
  try {
    const locked = await runProviderSearchWithLock({
      lock,
      holderEmail,
      runSearch: () =>
        options?.runSearch
          ? options.runSearch(profile, { forceMock: options?.forceMock })
          : runInternetSearch(profile, { forceMock: options?.forceMock }),
    });

    if (locked.error || !locked.search) {
      return { error: locked.error || SEARCH_ALREADY_RUNNING_MESSAGE };
    }
    search = locked.search;
  } catch (e) {
    const failedReport = buildFailedSearchReport({
      profile,
      error: e,
      resolvedProviderId,
      resolvedModel,
    });
    await persistSearchRun(access.supabase, holderEmail, failedReport);
    return { report: failedReport };
  }

  const report: SearchRunReport = {
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
    errors: [...(search.stageErrors ?? [])],
    trucksSaved: [],
    contactsFound: [],
  };

  return applySearchProviderResult({
    access,
    profile,
    existingLeads,
    existingContacts,
    search,
    report,
  });
}

/**
 * Persist contacts + truck leads from a provider result (shared by internet search
 * and Penske inspect-only). Testable without live providers.
 */
export async function applySearchProviderResult(options: {
  access: Extract<Awaited<ReturnType<typeof requireSourcingStaff>>, { ok: true }>;
  profile: BuyingProfile;
  existingLeads: TruckLead[];
  existingContacts: Awaited<ReturnType<typeof getSupplierContacts>>;
  search: SearchProviderResult;
  report: SearchRunReport;
}): Promise<{ report: SearchRunReport }> {
  const { access, profile, existingLeads, existingContacts, search, report } = options;

  const contactPool: LinkableContact[] = existingContacts.map((c) => ({
    id: c.id,
    company: c.company,
    phone: c.phone,
    sourceUrl: c.sourceUrl,
  }));

  // Save contacts first so same-run trucks can link by company / phone / domain.
  for (const contact of search.payload.contacts) {
    const mapped = candidateToContactInput(contact);
    if (mapped.rejectReason) {
      report.duplicatesOrRejected += 1;
      report.contactsFound.push({
        company: contact.company,
        phone: contact.phone,
        contactName: contact.contactName,
        sourceUrl: contact.sourceUrl,
        outcome: "rejected",
        reason: mapped.rejectReason,
      });
      continue;
    }

    const existingInPool = findUnambiguousContactMatch(
      {
        seller: mapped.input.company,
        companyName: mapped.input.company,
        phone: mapped.input.phone,
        listingUrl: mapped.input.sourceUrl,
        sourceUrl: mapped.input.sourceUrl,
      },
      contactPool
    );

    if (existingInPool) {
      report.contactsFound.push({
        company: mapped.input.company,
        phone: mapped.input.phone,
        contactName: mapped.input.contactName,
        sourceUrl: mapped.input.sourceUrl,
        outcome: "skipped",
        reason: "Company already in supplier contacts.",
      });
      continue;
    }

    const { data: existingContact } = await access.supabase
      .from("sourcing_supplier_contacts")
      .select("id, company, phone, source_url")
      .ilike("company", mapped.input.company)
      .limit(1)
      .maybeSingle();

    if (existingContact?.id) {
      if (!contactPool.some((c) => c.id === existingContact.id)) {
        contactPool.push({
          id: existingContact.id,
          company: existingContact.company,
          phone: existingContact.phone ?? mapped.input.phone,
          sourceUrl: existingContact.source_url ?? mapped.input.sourceUrl,
        });
      }
      report.contactsFound.push({
        company: mapped.input.company,
        phone: mapped.input.phone,
        contactName: mapped.input.contactName,
        sourceUrl: mapped.input.sourceUrl,
        outcome: "skipped",
        reason: "Company already in supplier contacts.",
      });
      continue;
    }

    const result = await upsertSupplierContact(mapped.input);
    if (result.error) {
      const reason = formatDatabaseInsertFailure(result.error);
      report.errors.push(reason);
      report.duplicatesOrRejected += 1;
      report.contactsFound.push({
        company: mapped.input.company,
        phone: mapped.input.phone,
        contactName: mapped.input.contactName,
        sourceUrl: mapped.input.sourceUrl,
        outcome: "rejected",
        reason,
      });
      continue;
    }
    if (result.contact) {
      contactPool.push({
        id: result.contact.id,
        company: result.contact.company,
        phone: result.contact.phone,
        sourceUrl: result.contact.sourceUrl,
      });
    }
    report.contactsSaved += 1;
    report.contactsFound.push({
      company: mapped.input.company,
      phone: mapped.input.phone,
      contactName: mapped.input.contactName,
      sourceUrl: mapped.input.sourceUrl,
      outcome: "inserted",
    });
  }

  const batchLeads: TruckLead[] = [...existingLeads];
  const now = new Date();

  for (const truck of search.payload.trucks) {
    const mapped = candidateToTruckLeadInput(truck);
    if (mapped.rejectReason) {
      report.duplicatesOrRejected += 1;
      report.trucksSaved.push({
        seller: truck.seller || truck.sourceName,
        stockNumber: truck.stockNumber,
        listingUrl: truck.listingUrl,
        matchStatus: "rejected",
        outcome: "rejected",
        reason: mapped.rejectReason,
      });
      continue;
    }

    const linked = findUnambiguousContactMatch(
      {
        seller: mapped.input.seller,
        companyName: truck.seller || truck.sourceName,
        phone: truck.phone,
        listingUrl: truck.listingUrl || mapped.input.sourceUrl,
        sourceUrl: mapped.input.sourceUrl,
      },
      contactPool
    );

    if (linked) {
      mapped.input.supplierContactId = linked.id;
      mapped.input.seller = preferSellerDisplayName(
        mapped.input.seller,
        mapped.input.sourceUrl,
        linked.company
      );
    }

    const existing = findExistingLead(batchLeads, mapped.input);
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
      const { data, error } = await access.supabase
        .from("sourcing_truck_leads")
        .insert(row)
        .select("id")
        .single();
      if (error) {
        const reason = formatDatabaseInsertFailure(error.message);
        report.duplicatesOrRejected += 1;
        report.errors.push(reason);
        report.trucksSaved.push({
          seller: plan.input.seller,
          stockNumber: plan.input.stockNumber,
          listingUrl: plan.input.sourceUrl,
          matchStatus: match.status,
          outcome: "rejected",
          reason,
        });
        // Never count failed inserts as saved leads
        continue;
      }
      savedId = data.id;
      report.newLeadsSaved += 1;
    } else {
      const { error } = await access.supabase
        .from("sourcing_truck_leads")
        .update(row)
        .eq("id", plan.existingId!);
      if (error) {
        const reason = formatDatabaseInsertFailure(error.message);
        report.errors.push(reason);
        report.duplicatesOrRejected += 1;
        report.trucksSaved.push({
          seller: plan.input.seller,
          stockNumber: plan.input.stockNumber,
          listingUrl: plan.input.sourceUrl,
          matchStatus: match.status,
          outcome: "rejected",
          reason,
        });
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
    });

    const synthetic: TruckLead = {
      id: savedId || `tmp-${report.trucksSaved.length}`,
      ...plan.input,
      matchStatus: match.status,
      matchReasons: match.reasons,
      listingFirstSeenAt: plan.listingFirstSeenAt,
      listingLastChangedAt: plan.listingLastChangedAt,
      listingLastSeenAt: plan.listingLastSeenAt,
    };
    if (existing) {
      const idx = batchLeads.findIndex((l) => l.id === existing.id);
      if (idx >= 0) batchLeads[idx] = synthetic;
    } else {
      batchLeads.push(synthetic);
    }
  }

  if (report.errors.length) report.status = "partial";

  const saved = await persistSearchRun(access.supabase, access.user.email ?? "", report);
  if (saved.id) report.id = saved.id;
  if (saved.error) report.errors.push(saved.error);

  return { report };
}

async function persistSearchRun(
  supabase: SupabaseClient,
  email: string,
  report: SearchRunReport
): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
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
      created_by_email: email,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}

export async function listRecentSearchRuns(limit = 10): Promise<SearchRunReport[]> {
  const access = await requireSourcingStaff();
  if (!access.ok) return [];

  const { data, error } = await access.supabase
    .from("sourcing_search_runs")
    .select("id, report, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((row) => {
    const report = (row.report || {}) as SearchRunReport;
    return { ...report, id: row.id };
  });
}

export { evaluateSearchPayloadForTest } from "@/lib/sourcing/search/evaluate";
