/**
 * Import selected listing URLs with full server-side revalidation.
 *
 * Client may supply ONLY selected URLs (and opaque selection ids if needed).
 * Never trusts truck fields, classification, evidence, usage, or importEligible.
 *
 * Import path:
 * 1. Staff auth
 * 2. Establish deadlineAt (before DB reads / lock)
 * 3. Hard selected-row cap
 * 4. Re-classify URL / SSRF-safe validate / deterministic extract
 * 5. candidateToTruckLeadInput + classifyLead + dedupe against current DB
 * 6. Pre-write deadline check — if expired, return partial with zero writes
 * 7. Persist only Confirmed / Needs verification (persistence is NOT Promise.race'd)
 *
 * Deadline governs pre-write preparation only. Once applySearchProviderResult
 * begins, it completes safely. Platform hard-kills can still skip `finally`;
 * stale-lock takeover remains the backstop.
 */
import { requireSourcingStaff } from "@/lib/sourcing/access";
import { canonicalizeListingUrl } from "@/lib/sourcing/duplicates";
import { findExistingLead } from "@/lib/sourcing/intake/import";
import { classifyLead } from "@/lib/sourcing/match";
import { getBuyingProfile, getSupplierContacts, getTruckLeads } from "@/lib/sourcing/db";
import {
  DISCOVERY_IMPORT_DEADLINE_MS,
  DISCOVERY_IMPORT_MAX_SELECTED,
} from "@/lib/sourcing/search/discovery/ceilings";
import {
  isDeadlineExceeded,
  isPastDeadline,
  withDeadline,
} from "@/lib/sourcing/search/discovery-inspect/deadline";
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
import type { BuyingProfile, SupplierContact, TruckLead } from "@/types/sourcing";

/** Re-export for callers — same as ceilings. */
export { DISCOVERY_IMPORT_MAX_SELECTED, DISCOVERY_IMPORT_DEADLINE_MS };

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
  stoppedReason: string | null;
  deadlineAt: number;
};

export type ImportPersistFn = typeof applySearchProviderResult;

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
 * Requires an absolute deadlineAt from the Import entry (same clock for the whole action).
 */
export async function revalidateSelectedUrlsForImport(options: {
  selectedUrls: string[];
  profile: BuyingProfile;
  existingLeads: TruckLead[];
  fetchImpl?: typeof fetch;
  /** Absolute deadline shared with Import entry — required for production Import path. */
  deadlineAt: number;
}): Promise<ImportRevalidateResult> {
  const urls = normalizeSelectedUrls(options.selectedUrls);
  const { deadlineAt } = options;
  const rejected: ImportRevalidateRejection[] = [];
  const errors: string[] = [];
  const trucks: ExtractedTruckCandidate[] = [];
  const contacts: ExtractedContactCandidate[] = [];
  const seenVins = new Set<string>();
  const seenCanonicals = new Set<string>();
  let stoppedReason: string | null = null;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (isPastDeadline(deadlineAt)) {
      stoppedReason = stoppedReason || "import deadline reached";
      for (const remaining of urls.slice(i)) {
        rejected.push({ url: remaining, reason: "skipped — import deadline" });
      }
      break;
    }

    let validated;
    try {
      validated = await withDeadline(
        validateDiscoveryCandidate(url, {
          fetchImpl: options.fetchImpl,
          deadlineAt,
        }),
        deadlineAt,
        `import validate ${url}`
      );
    } catch (e) {
      if (isDeadlineExceeded(e)) {
        stoppedReason = "import deadline reached";
        rejected.push({ url, reason: "skipped — import deadline" });
        for (const remaining of urls.slice(i + 1)) {
          rejected.push({ url: remaining, reason: "skipped — import deadline" });
        }
        break;
      }
      rejected.push({
        url,
        reason: e instanceof Error ? e.message.slice(0, 120) : "validate failed",
      });
      continue;
    }

    if (validated.outcome !== "validated" || !validated.html) {
      rejected.push({
        url,
        reason: validated.reason || validated.outcome,
      });
      continue;
    }

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

    if (isPastDeadline(deadlineAt)) {
      stoppedReason = stoppedReason || "import deadline reached";
      rejected.push({ url, reason: "skipped — import deadline" });
      for (const remaining of urls.slice(i + 1)) {
        rejected.push({ url: remaining, reason: "skipped — import deadline" });
      }
      break;
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
    stoppedReason,
    deadlineAt,
  };
}

export type ImportSelectedResult = {
  error?: string;
  report?: SearchRunReport;
  importedCount?: number;
  rejected?: ImportRevalidateRejection[];
};

function emptyImportUsage(): SearchApiUsage {
  return {
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
}

function buildZeroWriteReport(args: {
  profile: BuyingProfile;
  revalidated: ImportRevalidateResult;
  extraErrors?: string[];
}): SearchRunReport {
  const usage = emptyImportUsage();
  return {
    status: "completed",
    generatedAt: new Date().toISOString(),
    buyingProfile: args.profile,
    queriesExecuted: [],
    sourcesSearched: [],
    resultsExamined: 0,
    newLeadsSaved: 0,
    confirmedMatches: 0,
    needsVerification: 0,
    duplicatesOrRejected: args.revalidated.rejected.length,
    contactsSaved: 0,
    apiUsage: usage,
    errors: [
      ...(args.extraErrors ?? []),
      ...args.revalidated.errors,
      ...args.revalidated.rejected.map((r) => `${r.url}: ${r.reason}`),
    ],
    trucksSaved: [],
    contactsFound: [],
  };
}

/**
 * True when Import may begin persistence. Deadline governs preparation only;
 * once persistence starts it is not raced/detached.
 */
export function importMayBeginPersistence(deadlineAt: number, nowMs = Date.now()): boolean {
  return nowMs < deadlineAt;
}

/**
 * Staff Import: revalidate selected URLs server-side, then persist.
 * Zero Tavily / OpenAI.
 */
export async function importSelectedDiscoveryInspectRows(options: {
  selectedUrls: string[];
  /** @deprecated Ignored — client Preview payloads are never trusted. */
  preview?: unknown;
  selectedRowIds?: string[];
  lockStore?: SearchLockStore;
  fetchImpl?: typeof fetch;
  importDeadlineMs?: number;
  /** Absolute deadline override (tests). */
  deadlineAt?: number;
  /** Clock override (tests). */
  nowMs?: () => number;
  /**
   * Persistence seam (tests). Production uses applySearchProviderResult.
   * Never Promise.race this — once invoked it must complete.
   */
  persistFn?: ImportPersistFn;
  /** Test seam: skip requireSourcingStaff and supply access directly. */
  accessOverride?: Awaited<ReturnType<typeof requireSourcingStaff>>;
  profileOverride?: BuyingProfile;
  existingLeadsOverride?: TruckLead[];
  existingContactsOverride?: SupplierContact[];
}): Promise<ImportSelectedResult> {
  const now = options.nowMs ?? Date.now;
  const access = options.accessOverride ?? (await requireSourcingStaff());
  if (!access.ok) return { error: access.error };

  const urls = normalizeSelectedUrls(options.selectedUrls ?? []);
  if (urls.length === 0) {
    return { error: "Select at least one listing URL." };
  }

  // Establish the overall Import deadline BEFORE DB reads and lock acquisition.
  const deadlineAt =
    options.deadlineAt ??
    now() + (options.importDeadlineMs ?? DISCOVERY_IMPORT_DEADLINE_MS);

  const profile = options.profileOverride ?? (await getBuyingProfile());
  const existingLeads = options.existingLeadsOverride ?? (await getTruckLeads());
  const existingContacts =
    options.existingContactsOverride ?? (await getSupplierContacts());

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

  const persist = options.persistFn ?? applySearchProviderResult;

  try {
    // If deadline already expired during DB/lock setup, skip revalidation writes.
    if (!importMayBeginPersistence(deadlineAt, now())) {
      const rejected = urls.map((url) => ({
        url,
        reason: "skipped — import deadline",
      }));
      return {
        error: "Import deadline expired before revalidation; zero writes.",
        importedCount: 0,
        rejected,
        report: buildZeroWriteReport({
          profile,
          revalidated: {
            trucks: [],
            contacts: [],
            rejected,
            errors: [],
            tavilyCalls: 0,
            openAiCalls: 0,
            stoppedReason: "import deadline reached",
            deadlineAt,
          },
          extraErrors: ["Import deadline expired before revalidation; zero writes."],
        }),
      };
    }

    const revalidated = await revalidateSelectedUrlsForImport({
      selectedUrls: urls,
      profile,
      existingLeads,
      fetchImpl: options.fetchImpl,
      deadlineAt,
    });

    // Pre-write deadline check. Do not start persistence if expired.
    // Deadline does NOT Promise.race / detach DB writes once they begin.
    if (!importMayBeginPersistence(deadlineAt, now())) {
      const skippedPrepared = revalidated.trucks.map((t) => ({
        url: t.listingUrl,
        reason: "skipped — import deadline before persist",
      }));
      const rejected = [...revalidated.rejected, ...skippedPrepared];
      return {
        error: "Import deadline expired before persistence; zero writes.",
        importedCount: 0,
        rejected,
        report: buildZeroWriteReport({
          profile,
          revalidated: { ...revalidated, trucks: [], contacts: [], rejected },
          extraErrors: [
            "Import deadline expired before persistence; zero writes.",
            "Deadline governs pre-write preparation only; persistence was not started.",
          ],
        }),
      };
    }

    if (revalidated.trucks.length === 0) {
      return {
        error: "No importable rows after server revalidation.",
        rejected: revalidated.rejected,
        importedCount: 0,
        report: buildZeroWriteReport({ profile, revalidated }),
      };
    }

    const usage = emptyImportUsage();

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
          "Imported via Discovery → Inspection Import. Server revalidated URLs with deterministic extract only; zero Tavily/OpenAI calls during Import. Deadline governed pre-write preparation only.",
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

    // Persistence begins — not raced against deadline; must complete safely.
    const applied = await persist({
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
