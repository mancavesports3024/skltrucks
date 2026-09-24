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
} from "@/lib/sourcing/search/discovery/ceilings";
export {
  runDiscoveryInspectPreview,
  buildDiscoveryInspectPreflight,
  createTavilyDiscoveryOnlyClient,
} from "@/lib/sourcing/search/discovery-inspect/preview";
export {
  validateDiscoveryCandidate,
} from "@/lib/sourcing/search/discovery-inspect/validate-url";
export {
  assertPublicHttpUrl,
  safeFetchPublicHtml,
} from "@/lib/sourcing/search/discovery-inspect/fetch-page";
export {
  createMockDiscoveryInspectSearchClient,
  createMockValidateFetchImpl,
  mockHtmlForUrl,
} from "@/lib/sourcing/search/discovery-inspect/mock";
export {
  DISCOVERY_INSPECT_CONFIRM_FIELD,
  DISCOVERY_INSPECT_CONFIRM_VALUE,
  type DiscoveryInspectPreviewReport,
  type DiscoveryInspectPreviewRow,
} from "@/lib/sourcing/search/discovery-inspect/types";
