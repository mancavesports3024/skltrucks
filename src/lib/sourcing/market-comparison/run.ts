import "server-only";

import { requireSourcingStaff } from "@/lib/sourcing/access";
import { buildMarketComparisonReport } from "@/lib/sourcing/market-comparison/build-report";
import {
  isLeadEligibleForMarketComparison,
  leadToComparisonSnapshot,
  missingRequiredLeadFields,
} from "@/lib/sourcing/market-comparison/eligibility";
import { mockComparableListings, mockMarketComparisonUsage } from "@/lib/sourcing/market-comparison/mock";
import { runOpenAiMarketComparableSearch } from "@/lib/sourcing/market-comparison/provider";
import {
  MARKET_COMPARISON_CONFIRM_FIELD,
  MARKET_COMPARISON_CONFIRM_VALUE,
  MARKET_COMPARISON_MAX_EXPECTED_COST_USD,
  MARKET_COMPARISON_MAX_TOOL_CALLS,
  MARKET_COMPARISON_TYPICAL_COST_USD_MAX,
  MARKET_COMPARISON_TYPICAL_COST_USD_MIN,
  type ComparableListingRaw,
  type LandedCostInput,
  type MarketComparisonReport,
} from "@/lib/sourcing/market-comparison/types";
import { getTruckLeadById, insertMarketComparison } from "@/lib/sourcing/db";
import {
  isOpenAiSearchConfigured,
  type OpenAiResponsesClient,
} from "@/lib/sourcing/search/providers/openai";
import type { SearchApiUsage } from "@/lib/sourcing/search/types";
import {
  resolveSearchLockStore,
  SEARCH_ALREADY_RUNNING_MESSAGE,
  type SearchLockStore,
} from "@/lib/sourcing/search/search-lock";

export const MARKET_COMPARISON_CONFIRM_REQUIRED =
  "Confirm that this run will use a paid OpenAI web search (typically about $" +
  MARKET_COMPARISON_TYPICAL_COST_USD_MIN.toFixed(2) +
  "–$" +
  MARKET_COMPARISON_TYPICAL_COST_USD_MAX.toFixed(2) +
  ", hard ceiling $" +
  MARKET_COMPARISON_MAX_EXPECTED_COST_USD.toFixed(2) +
  ") before comparing.";

export type ExecuteMarketComparisonResult = {
  error?: string;
  report?: MarketComparisonReport;
  comparisonId?: string;
};

type CapturedProvider = {
  listings: ComparableListingRaw[];
  apiUsage: SearchApiUsage;
  queriesUsed: string[];
  sourcesConsulted: string[];
  notes: string;
  error?: string;
  provider: "openai" | "mock";
};

/**
 * Staff-operated, one-lead market comparison.
 * Uses the shared sourcing search lock. No cron. Provider call happens only inside the lock.
 */
export async function executeMarketComparison(options: {
  leadId: string;
  confirmPaidSearch: boolean;
  landedCostInput?: Partial<LandedCostInput>;
  /** Unpaid dry-run / unit tests — never calls OpenAI. */
  forceMock?: boolean;
  lockStore?: SearchLockStore;
  openAiClient?: OpenAiResponsesClient;
  accessOverride?: Awaited<ReturnType<typeof requireSourcingStaff>>;
}): Promise<ExecuteMarketComparisonResult> {
  const access = options.accessOverride ?? (await requireSourcingStaff());
  if (!access.ok) return { error: access.error };

  const useMock = Boolean(options.forceMock) || !isOpenAiSearchConfigured();
  if (!options.confirmPaidSearch && !useMock) {
    return { error: MARKET_COMPARISON_CONFIRM_REQUIRED };
  }

  const lead = await getTruckLeadById(options.leadId);
  if (!lead) return { error: "Lead not found." };

  const snapshot = leadToComparisonSnapshot(lead);
  if (!isLeadEligibleForMarketComparison(snapshot)) {
    const missing = missingRequiredLeadFields(snapshot);
    return {
      error: `Cannot compare market — missing required fields: ${missing.join(", ")}.`,
    };
  }

  const lock = options.lockStore ?? resolveSearchLockStore(access.supabase);
  const holderEmail = access.user.email ?? "";
  /** Persisted as created_by — DB trigger overwrites with auth.uid(). */
  const createdByUid = access.user.id ?? "";

  const acquired = await lock.tryAcquire(holderEmail);
  if (!acquired.ok) {
    return {
      error:
        acquired.reason === "already_running"
          ? SEARCH_ALREADY_RUNNING_MESSAGE
          : acquired.message || SEARCH_ALREADY_RUNNING_MESSAGE,
    };
  }

  let captured: CapturedProvider;
  try {
    if (useMock) {
      captured = {
        listings: mockComparableListings(snapshot),
        apiUsage: mockMarketComparisonUsage(),
        queriesUsed: ["mock market comparison"],
        sourcesConsulted: ["mock"],
        notes: "Mock market comparison — not a live provider run.",
        provider: "mock",
      };
    } else {
      const live = await runOpenAiMarketComparableSearch(snapshot, {
        client: options.openAiClient,
        maxToolCalls: MARKET_COMPARISON_MAX_TOOL_CALLS,
      });
      captured = {
        listings: live.listings,
        apiUsage: live.apiUsage,
        queriesUsed: live.queriesUsed,
        sourcesConsulted: live.sourcesConsulted,
        notes: live.notes,
        error: live.error,
        provider: "openai",
      };
    }
  } finally {
    await lock.release(holderEmail);
  }

  if (captured.error) {
    await insertMarketComparison({
      leadId: lead.id,
      status: "failed",
      assessment: null,
      confidence: null,
      report: null,
      apiUsage: captured.apiUsage,
      errorMessage: captured.error,
      createdBy: createdByUid,
    });
    return { error: `Provider failure: ${captured.error}` };
  }

  const report = buildMarketComparisonReport({
    lead: snapshot,
    listings: captured.listings,
    apiUsage: captured.apiUsage,
    queriesUsed: captured.queriesUsed,
    sourcesConsulted: captured.sourcesConsulted,
    warnings: captured.notes ? [captured.notes] : [],
    landedCostInput: options.landedCostInput,
    provider: captured.provider,
  });

  const saved = await insertMarketComparison({
    leadId: lead.id,
    status: "completed",
    assessment: report.assessment,
    confidence: report.confidence,
    report,
    apiUsage: report.apiUsage,
    errorMessage: null,
    createdBy: createdByUid,
  });

  if (saved.error) {
    return {
      error: `Comparison succeeded but failed to save: ${saved.error}`,
      report,
    };
  }

  return { report, comparisonId: saved.id };
}

export function isPaidSearchConfirmed(formData: FormData): boolean {
  return (
    String(formData.get(MARKET_COMPARISON_CONFIRM_FIELD) ?? "") ===
    MARKET_COMPARISON_CONFIRM_VALUE
  );
}
