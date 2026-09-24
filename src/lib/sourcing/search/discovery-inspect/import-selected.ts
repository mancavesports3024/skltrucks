/**
 * Import selected Preview rows into SKL (explicit staff action).
 * Re-validates eligibility server-side; never imports hubs/rejected/unverified.
 */
import { requireSourcingStaff } from "@/lib/sourcing/access";
import { getBuyingProfile, getSupplierContacts, getTruckLeads } from "@/lib/sourcing/db";
import type { DiscoveryInspectPreviewReport } from "@/lib/sourcing/search/discovery-inspect/types";
import { applySearchProviderResult } from "@/lib/sourcing/search/run";
import type { SearchProviderResult } from "@/lib/sourcing/search/providers/types";
import type { SearchRunReport } from "@/lib/sourcing/search/types";

export type ImportSelectedResult = {
  error?: string;
  report?: SearchRunReport;
  importedCount?: number;
};

/**
 * Import only staff-selected, import-eligible Preview rows.
 * Reconstructs a SearchProviderResult from the Preview payload (no new provider calls).
 */
export async function importSelectedDiscoveryInspectRows(options: {
  preview: DiscoveryInspectPreviewReport;
  selectedRowIds: string[];
}): Promise<ImportSelectedResult> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  if (!options.preview?.previewOnly || options.preview.dbWrites !== false) {
    return { error: "Invalid Preview payload." };
  }

  const selected = new Set(options.selectedRowIds.map(String));
  if (selected.size === 0) {
    return { error: "Select at least one import-eligible row." };
  }

  const eligible = options.preview.rows.filter(
    (r) =>
      selected.has(r.id) &&
      r.importEligible &&
      r.truck &&
      (r.previewOutcome === "confirmed_match" || r.previewOutcome === "needs_verification")
  );

  if (eligible.length === 0) {
    return { error: "No import-eligible selected rows (hubs/rejected/duplicates are blocked)." };
  }

  const profile = await getBuyingProfile();
  const existingLeads = await getTruckLeads();
  const existingContacts = await getSupplierContacts();

  const trucks = eligible.map((r) => r.truck!);
  const contacts = eligible
    .map((r) => r.contact)
    .filter((c): c is NonNullable<typeof c> => Boolean(c?.phone && c?.company));

  const search: SearchProviderResult = {
    provider: options.preview.usage.provider,
    payload: {
      trucks,
      contacts,
      sourcesConsulted: [...new Set(trucks.map((t) => {
        try {
          return new URL(t.listingUrl).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      }).filter(Boolean))],
      queriesUsed: options.preview.queryPlans.map((p) => p.query),
      notes: "Imported from Discovery → Inspection Preview (explicit staff Import).",
    },
    usage: {
      ...options.preview.usage,
      live: false,
    },
    rawText: "",
    queriesPlanned: options.preview.queryPlans.map((p) => p.query),
    stageErrors: [],
  };

  const report: SearchRunReport = {
    status: "completed",
    generatedAt: new Date().toISOString(),
    buyingProfile: profile,
    queriesExecuted: search.payload.queriesUsed,
    sourcesSearched: search.payload.sourcesConsulted,
    resultsExamined: trucks.length + contacts.length,
    newLeadsSaved: 0,
    confirmedMatches: 0,
    needsVerification: 0,
    duplicatesOrRejected: 0,
    contactsSaved: 0,
    apiUsage: search.usage,
    errors: [],
    trucksSaved: [],
    contactsFound: [],
  };

  const applied = await applySearchProviderResult({
    access,
    profile,
    existingLeads,
    existingContacts,
    search,
    report,
  });

  return {
    report: applied.report,
    importedCount: applied.report.newLeadsSaved,
  };
}
