/**
 * Import selected listing URLs with full server-side revalidation.
 *
 * Client may supply ONLY selected URLs (and opaque selection ids if needed).
 * Never trusts truck fields, classification, evidence, usage, or importEligible.
 *
 * Import path:
 * 1. Staff auth
 * 2. Hard selected-row cap
 * 3. Re-classify URL
 * 4. SSRF-safe validate + fetch
 * 5. Deterministic HTML extract only (zero Tavily / OpenAI)
 * 6. candidateToTruckLeadInput + classifyLead + dedupe against current DB
 * 7. Persist only Confirmed / Needs verification
 */
import { requireSourcingStaff } from "@/lib/sourcing/access";
import { canonicalizeListingUrl } from "@/lib/sourcing/duplicates";
import { findExistingLead } from "@/lib/sourcing/intake/import";
import { classifyLead } from "@/lib/sourcing/match";
import { getBuyingProfile, getSupplierContacts, getTruckLeads } from "@/lib/sourcing/db";
import { DISCOVERY_IMPORT_MAX_SELECTED } from "@/lib/sourcing/search/discovery/ceilings";
import { inspectListingHtmlDeterministic } from "@/lib/sourcing/search/discovery-inspect/deterministic-inspect";
import { validateDiscoveryCandidate } from "@/lib/sourcing/search/discovery-inspect/validate-url";
import { candidateToTruckLeadInput } from "@/lib/sourcing/search/map-candidates";
import { applySearchProviderResult } from "@/lib/sourcing/search/run";
import type { SearchProviderResult } from "@/lib/sourcing/search/providers/types";
import type {
  ExtractedContactCandidate,
  ExtractedTruckCandidate,
  SearchApiUsage,
  SearchRunReport,
} from "@/lib/sourcing/search/types";
import {
  resolveSearchLockStore,
  SEARCH_ALREADY_RUNNING_MESSAGE,
  type SearchLockStore,
} from "@/lib/sourcing/search/search-lock";
import type { BuyingProfile, TruckLead } from "@/types/sourcing";

/** Re-export for callers — same as ceilings. */
export { DISCOVERY_IMPORT_MAX_SELECTED };

export type ImportSelectionInput = {
  /** Canonical or final listing URLs only — no truck/evidence payload. */
  selectedUrls: string[];
};

export type ImportRevalidateRejection = {
  url: string;
  reason: string;
};

export type ImportRevalidateResult = {
  trucks: ExtractedTruckCandidate[];
  contacts: ExtractedContactCandidate[];
  rejected: ImportRevalidateRejection[];
  errors: string[];
  /** Always zero — Import never calls paid providers. */
  tavilyCalls: 0;
  openAiCalls: 0;
};

function normalizeSelectedUrls(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed) continue;
    let canonical = "";
    try {
      canonical = canonicalizeListingUrl(trimmed) || trimmed;
    } catch {
      canonical = trimmed;
    }
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
    if (out.length >= DISCOVERY_IMPORT_MAX_SELECTED) break;
  }
  return out;
}

/**
 * Pure revalidation core (no auth / no DB writes). Used by Import and tests.
 * Never accepts client truck/classification fields.
 */
export async function revalidateSelectedUrlsForImport(options: {
  selectedUrls: string[];
  profile: BuyingProfile;
  existingLeads: TruckLead[];
  fetchImpl?: typeof fetch;
}): Promise<ImportRevalidateResult> {
  const urls = normalizeSelectedUrls(options.selectedUrls);
  const rejected: ImportRevalidateRejection[] = [];
  const errors: string[] = [];
  const trucks: ExtractedTruckCandidate[] = [];
  const contacts: ExtractedContactCandidate[] = [];
  const seenVins = new Set<string>();
  const seenCanonicals = new Set<string>();

  for (const url of urls) {
    const validated = await validateDiscoveryCandidate(url, {
      fetchImpl: options.fetchImpl,
    });

    if (validated.outcome !== "validated" || !validated.html) {
      rejected.push({
        url,
        reason: validated.reason || validated.outcome,
      });
      continue;
    }

    // Final URL must still match the selection canonical (no silent substitution).
    const finalCanonical = canonicalizeListingUrl(validated.finalUrl);
    const selectedCanonical = canonicalizeListingUrl(url);
    if (finalCanonical && selectedCanonical && finalCanonical !== selectedCanonical) {
      const sameListing =
        finalCanonical.replace(/\/+$/, "") === selectedCanonical.replace(/\/+$/, "");
      if (!sameListing) {
        rejected.push({
          url,
          reason: "final URL mismatch after validation",
        });
        continue;
      }
    }

    let truck: ExtractedTruckCandidate;
    let contact: ExtractedContactCandidate | null;
    try {
      const det = inspectListingHtmlDeterministic({
        finalUrl: validated.finalUrl,
        html: validated.html,
        title: validated.title,
      });
      truck = det.truck;
      contact = det.contact;
    } catch (e) {
      rejected.push({
        url,
        reason: e instanceof Error ? e.message.slice(0, 120) : "deterministic inspect failed",
      });
      continue;
    }

    const mapped = candidateToTruckLeadInput(truck);
    if (mapped.rejectReason || !mapped.input) {
      rejected.push({
        url,
        reason: mapped.rejectReason || "candidate mapping rejected",
      });
      continue;
    }

    const vinKey = (mapped.input.vin || "").trim().toUpperCase();
    const canonKey = (mapped.input.canonicalListingUrl || finalCanonical || "").toLowerCase();
    if ((vinKey && seenVins.has(vinKey)) || (canonKey && seenCanonicals.has(canonKey))) {
      rejected.push({ url, reason: "duplicate within Import selection" });
      continue;
    }

    const existing = findExistingLead(options.existingLeads, mapped.input);
    if (existing) {
      rejected.push({ url, reason: "Already in SKL (VIN / listing id / canonical URL)" });
      continue;
    }

    const match = classifyLead(mapped.input, options.profile);
    if (
      match.status !== "confirmed_match" &&
      match.status !== "needs_verification" &&
      match.status !== "out_of_range_opportunity"
    ) {
      rejected.push({
        url,
        reason: match.reasons[0]?.label || "deterministic mismatch",
      });
      continue;
    }

    trucks.push(truck);
    if (contact?.phone && (contact.company || contact.contactName)) {
      contacts.push(contact);
    }
    if (vinKey) seenVins.add(vinKey);
    if (canonKey) seenCanonicals.add(canonKey);
  }

  return {
    trucks,
    contacts,
    rejected,
    errors,
    tavilyCalls: 0,
    openAiCalls: 0,
  };
}

export type ImportSelectedResult = {
  error?: string;
  report?: SearchRunReport;
  importedCount?: number;
  rejected?: ImportRevalidateRejection[];
};

/**
 * Staff Import: revalidate selected URLs server-side, then persist.
 * Zero Tavily / OpenAI. Search lock always released.
 */
export async function importSelectedDiscoveryInspectRows(options: {
  selectedUrls: string[];
  /** @deprecated Ignored — client Preview payloads are never trusted. */
  preview?: unknown;
  selectedRowIds?: string[];
  lockStore?: SearchLockStore;
  fetchImpl?: typeof fetch;
}): Promise<ImportSelectedResult> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const urls = normalizeSelectedUrls(options.selectedUrls ?? []);
  if (urls.length === 0) {
    return { error: "Select at least one listing URL." };
  }
  if ((options.selectedUrls?.length ?? 0) > DISCOVERY_IMPORT_MAX_SELECTED) {
    // Cap silently via normalize; also surface if client sent excess.
    // Still proceed with capped set — authoritative server limit.
  }

  const profile = await getBuyingProfile();
  const existingLeads = await getTruckLeads();
  const existingContacts = await getSupplierContacts();

  const lock = options.lockStore ?? resolveSearchLockStore(access.supabase);
  const holderEmail = access.user.email ?? "";
  const acquired = await lock.tryAcquire(holderEmail);
  if (!acquired.ok) {
    return {
      error:
        acquired.reason === "already_running"
          ? SEARCH_ALREADY_RUNNING_MESSAGE
          : acquired.message || SEARCH_ALREADY_RUNNING_MESSAGE,
    };
  }

  try {
    const revalidated = await revalidateSelectedUrlsForImport({
      selectedUrls: urls,
      profile,
      existingLeads,
      fetchImpl: options.fetchImpl,
    });

    if (revalidated.trucks.length === 0) {
      return {
        error: "No importable rows after server revalidation.",
        rejected: revalidated.rejected,
        importedCount: 0,
      };
    }

    const usage: SearchApiUsage = {
      // Import itself made zero paid-provider calls (do not copy Preview usage).
      provider: "mock",
      model: "discovery-inspect-import-revalidate",
      webSearchCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      live: false,
      creditsConsumed: 0,
      searchesRun: 0,
      extractsRun: 0,
    };

    const search: SearchProviderResult = {
      provider: "mock",
      payload: {
        trucks: revalidated.trucks,
        contacts: revalidated.contacts,
        sourcesConsulted: [
          ...new Set(
            revalidated.trucks
              .map((t) => {
                try {
                  return new URL(t.listingUrl).hostname.replace(/^www\./, "");
                } catch {
                  return "";
                }
              })
              .filter(Boolean)
          ),
        ],
        queriesUsed: [],
        notes:
          "Imported via Discovery → Inspection Import. Server revalidated URLs with deterministic extract only; zero Tavily/OpenAI calls during Import.",
      },
      usage,
      rawText: "",
      queriesPlanned: [],
      stageErrors: revalidated.errors,
    };

    const report: SearchRunReport = {
      status: "completed",
      generatedAt: new Date().toISOString(),
      buyingProfile: profile,
      queriesExecuted: [],
      sourcesSearched: search.payload.sourcesConsulted,
      resultsExamined: revalidated.trucks.length + revalidated.contacts.length,
      newLeadsSaved: 0,
      confirmedMatches: 0,
      needsVerification: 0,
      duplicatesOrRejected: revalidated.rejected.length,
      contactsSaved: 0,
      apiUsage: usage,
      errors: [
        ...revalidated.errors,
        ...revalidated.rejected.map((r) => `${r.url}: ${r.reason}`),
      ],
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
      rejected: revalidated.rejected,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed" };
  } finally {
    await lock.release(holderEmail);
  }
}
