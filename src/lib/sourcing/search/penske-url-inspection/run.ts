import "server-only";

import { requireSourcingStaff } from "@/lib/sourcing/access";
import { getBuyingProfile, getSupplierContacts, getTruckLeads } from "@/lib/sourcing/db";
import {
  getPenskeUrlInspectionMaxToolCalls,
  isPenskeUrlInspectionEnabled,
  PENSKE_URL_INSPECTION_MAX_URLS,
} from "@/lib/sourcing/search/penske-url-inspection/flag";
import { runMockPenskeUrlInspection } from "@/lib/sourcing/search/penske-url-inspection/mock";
import { parseAndValidatePenskeUnitUrls } from "@/lib/sourcing/search/penske-url-inspection/validate";
import { isOpenAiSearchConfigured, runOpenAiInspectOnlyUrls } from "@/lib/sourcing/search/providers/openai";
import { buildFailedSearchReport } from "@/lib/sourcing/search/provider-error";
import {
  applySearchProviderResult,
  runProviderSearchWithLock,
} from "@/lib/sourcing/search/run";
import {
  resolveSearchLockStore,
  SEARCH_ALREADY_RUNNING_MESSAGE,
  type SearchLockStore,
} from "@/lib/sourcing/search/search-lock";
import type { SearchRunReport } from "@/lib/sourcing/search/types";
import type { BuyingProfile } from "@/types/sourcing";
import type { SearchProviderResult } from "@/lib/sourcing/search/providers/types";
import type { OpenAiResponsesClient } from "@/lib/sourcing/search/providers/openai";

export const PENSKE_URL_INSPECTION_DISABLED_MESSAGE =
  "Penske URL inspection is disabled. Set SOURCING_PENSKE_URL_INSPECTION_ENABLED=true only after written Penske authorization.";

/**
 * Staff-operated inspect-only run for validated Penske unit URLs.
 * Feature-flagged fail-closed. No discovery. Lock always released.
 */
export async function executePenskeUrlInspection(options: {
  urlsText: string;
  forceMock?: boolean;
  /** Test-only lock store. */
  lockStore?: SearchLockStore;
  /** Test-only OpenAI client. */
  openAiClient?: OpenAiResponsesClient;
  /** Test-only provider override (still after validation + lock). */
  runInspect?: (
    profile: BuyingProfile,
    urls: string[]
  ) => Promise<SearchProviderResult>;
  /** Test-only: skip requireSourcingStaff when access injected. */
  accessOverride?: Awaited<ReturnType<typeof requireSourcingStaff>>;
}): Promise<{ error?: string; report?: SearchRunReport }> {
  if (!isPenskeUrlInspectionEnabled()) {
    return { error: PENSKE_URL_INSPECTION_DISABLED_MESSAGE, report: undefined };
  }

  const access = options.accessOverride ?? (await requireSourcingStaff());
  if (!access.ok) return { error: access.error };

  const parsed = parseAndValidatePenskeUnitUrls(options.urlsText);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const urls = parsed.urls;
  if (urls.length > PENSKE_URL_INSPECTION_MAX_URLS) {
    return {
      error: `At most ${PENSKE_URL_INSPECTION_MAX_URLS} unique URLs per run.`,
    };
  }

  const profile = await getBuyingProfile();
  const existingLeads = await getTruckLeads();
  const existingContacts = await getSupplierContacts();

  const lock = options.lockStore ?? resolveSearchLockStore(access.supabase);
  const holderEmail = access.user.email ?? "";

  const useMock = Boolean(options.forceMock) || !isOpenAiSearchConfigured();
  const resolvedProviderId = useMock ? "mock" : "openai";
  const resolvedModel = useMock
    ? "mock"
    : process.env.OPENAI_SEARCH_MODEL?.trim() || "gpt-4o-mini";
  const maxToolCalls = getPenskeUrlInspectionMaxToolCalls();

  let search: SearchProviderResult;
  try {
    const locked = await runProviderSearchWithLock({
      lock,
      holderEmail,
      runSearch: () => {
        if (options.runInspect) {
          return options.runInspect(profile, urls);
        }
        if (useMock) {
          return Promise.resolve(runMockPenskeUrlInspection(profile, urls));
        }
        return runOpenAiInspectOnlyUrls(profile, urls, {
          client: options.openAiClient,
          maxToolCalls,
        });
      },
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
    // Persist failed run metadata via apply path would need access — use lock already released
    return { report: failedReport };
  }

  // Defense: drop any truck whose listingUrl is not exactly one of the submitted URLs
  const allowed = new Set(urls);
  const filteredTrucks = search.payload.trucks.filter((t) => allowed.has(t.listingUrl));
  const dropped = search.payload.trucks.length - filteredTrucks.length;
  if (dropped > 0) {
    search = {
      ...search,
      payload: {
        ...search.payload,
        trucks: filteredTrucks,
        notes: `${search.payload.notes} | Dropped ${dropped} truck(s) whose listingUrl was not in the staff-submitted set.`,
      },
      stageErrors: [
        ...(search.stageErrors ?? []),
        `Dropped ${dropped} truck(s) with listingUrl not in the submitted set.`,
      ],
    };
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
