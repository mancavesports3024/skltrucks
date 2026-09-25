/**
 * Staff entry: acquire search lock, run Preview (no DB writes), release in finally.
 * Platform hard-termination can skip finally; stale-lock takeover is the backstop.
 */
import { requireSourcingStaff } from "@/lib/sourcing/access";
import { getBuyingProfile, getTruckLeads } from "@/lib/sourcing/db";
import {
  clampDiscoveryInspectCeilings,
  type DiscoveryInspectCeilings,
} from "@/lib/sourcing/search/discovery/ceilings";
import {
  createMockDiscoveryInspectSearchClient,
  createMockValidateFetchImpl,
} from "@/lib/sourcing/search/discovery-inspect/mock";
import {
  buildDiscoveryInspectPreflight,
  createTavilyDiscoveryOnlyClient,
  runDiscoveryInspectPreview,
} from "@/lib/sourcing/search/discovery-inspect/preview";
import type { DiscoveryInspectPreviewReport } from "@/lib/sourcing/search/discovery-inspect/types";
import {
  DISCOVERY_INSPECT_CONFIRM_FIELD,
  DISCOVERY_INSPECT_CONFIRM_VALUE,
} from "@/lib/sourcing/search/discovery-inspect/types";
import {
  createTavilyClient,
  getTavilyApiKey,
} from "@/lib/sourcing/search/providers/tavily";
import {
  isOpenAiSearchConfigured,
  runOpenAiInspectOnlyUrls,
} from "@/lib/sourcing/search/providers/openai";
import {
  resolveSearchLockStore,
  SEARCH_ALREADY_RUNNING_MESSAGE,
  type SearchLockStore,
} from "@/lib/sourcing/search/search-lock";

export function isDiscoveryInspectPaidConfirmed(formData: FormData): boolean {
  return (
    String(formData.get(DISCOVERY_INSPECT_CONFIRM_FIELD) ?? "") ===
    DISCOVERY_INSPECT_CONFIRM_VALUE
  );
}

export async function executeDiscoveryInspectPreview(options: {
  forceMock?: boolean;
  confirmPaidProviders: boolean;
  ceilings?: Partial<DiscoveryInspectCeilings>;
  lockStore?: SearchLockStore;
}): Promise<{ error?: string; preview?: DiscoveryInspectPreviewReport }> {
  const access = await requireSourcingStaff();
  if (!access.ok) return { error: access.error };

  const profile = await getBuyingProfile();
  const existingLeads = await getTruckLeads();
  const ceilings = clampDiscoveryInspectCeilings(options.ceilings);
  const useMock = Boolean(options.forceMock) || !getTavilyApiKey();

  if (!useMock && !options.confirmPaidProviders) {
    return { error: "Confirm paid-provider use before running live Preview." };
  }

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
    const tavilyClient = useMock
      ? createMockDiscoveryInspectSearchClient()
      : createTavilyDiscoveryOnlyClient({
          search: (q, opts) => createTavilyClient(getTavilyApiKey()!).search(q, opts),
        });

    const openAiInspectUrl =
      !useMock && isOpenAiSearchConfigured()
        ? async (url: string) => {
            const result = await runOpenAiInspectOnlyUrls(profile, [url], {
              maxToolCalls: 1,
            });
            const truck = result.payload.trucks[0] ?? null;
            return {
              truck,
              rejectReason: truck ? undefined : result.payload.notes || "No truck extracted",
            };
          }
        : undefined;

    const preview = await runDiscoveryInspectPreview({
      profile,
      existingLeads,
      mode: useMock ? "mock" : "live",
      confirmPaidProviders: useMock || options.confirmPaidProviders,
      ceilings,
      tavilyClient,
      openAiInspectUrl,
      allowLiveNetwork: !useMock,
      validateFetchImpl: useMock ? createMockValidateFetchImpl() : undefined,
    });

    return { preview };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Preview failed" };
  } finally {
    await lock.release(holderEmail);
  }
}

export { buildDiscoveryInspectPreflight };
