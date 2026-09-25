/**
 * Production discovery-inspect public API.
 * Client components must NOT import this barrel — import ceilings/types directly.
 * Server actions import execute / import-selected from their modules.
 */
export {
  DEFAULT_DISCOVERY_INSPECT_CEILINGS,
  clampDiscoveryInspectCeilings,
  estimateDiscoveryInspectCombinedMaxCostUsd,
  estimateDiscoveryTavilyMaxCostUsd,
  estimateDiscoveryOpenAiInspectMaxCostUsd,
  DISCOVERY_MAX_QUERIES,
  DISCOVERY_MAX_TAVILY_CREDITS,
  DISCOVERY_INSPECT_MAX_CANDIDATES,
  DISCOVERY_INSPECT_MAX_OPENAI_CALLS,
  DISCOVERY_IMPORT_MAX_SELECTED,
  DISCOVERY_PREVIEW_DEADLINE_MS,
  DISCOVERY_IMPORT_DEADLINE_MS,
  DISCOVERY_VALIDATE_CONCURRENCY,
} from "@/lib/sourcing/search/discovery/ceilings";
export {
  runDiscoveryInspectPreview,
  buildDiscoveryInspectPreflight,
  createTavilyDiscoveryOnlyClient,
} from "@/lib/sourcing/search/discovery-inspect/preview";
export { validateDiscoveryCandidate } from "@/lib/sourcing/search/discovery-inspect/validate-url";
export {
  assertPublicHttpUrl,
  safeFetchPublicHtml,
  isBlockedIpAddress,
  resolvePublicHostAddresses,
  extractMappedIpv4,
  FETCH_MAX_BYTES,
  FETCH_OVERALL_DEADLINE_MS,
} from "@/lib/sourcing/search/discovery-inspect/fetch-page";
export {
  withDeadline,
  isPastDeadline,
  remainingMs,
  DeadlineExceededError,
  isDeadlineExceeded,
} from "@/lib/sourcing/search/discovery-inspect/deadline";
export {
  createMockDiscoveryInspectSearchClient,
  createMockValidateFetchImpl,
  mockHtmlForUrl,
} from "@/lib/sourcing/search/discovery-inspect/mock";
export {
  revalidateSelectedUrlsForImport,
  importSelectedDiscoveryInspectRows,
} from "@/lib/sourcing/search/discovery-inspect/import-selected";
export {
  DISCOVERY_INSPECT_CONFIRM_FIELD,
  DISCOVERY_INSPECT_CONFIRM_VALUE,
  type DiscoveryInspectPreviewReport,
  type DiscoveryInspectPreviewRow,
} from "@/lib/sourcing/search/discovery-inspect/types";
