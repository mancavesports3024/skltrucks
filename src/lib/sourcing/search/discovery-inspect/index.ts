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
export {
  validateDiscoveryCandidate,
  staffValidationFailureReason,
} from "@/lib/sourcing/search/discovery-inspect/validate-url";
export {
  assertRedirectPreservesListingIdentity,
  extractListingIdentityKeys,
  hasImportableUnitEvidence,
  hasContextualStockEvidence,
  isPageBackedStockEvidence,
  isRejectedStockToken,
  escapeRegExpLiteral,
  pickPageBackedIdentityFields,
  pathLooksLikeCategoryOrMarketplaceHub,
  REDIRECT_LOST_LISTING_IDENTITY,
} from "@/lib/sourcing/search/discovery-inspect/listing-identity";
export {
  assertPublicHttpUrl,
  safeFetchPublicHtml,
  isBlockedIpAddress,
  resolvePublicHostAddresses,
  extractMappedIpv4,
  createPinnedLookup,
  classifySafeFetchFailureReason,
  FETCH_MAX_BYTES,
  FETCH_OVERALL_DEADLINE_MS,
} from "@/lib/sourcing/search/discovery-inspect/fetch-page";
export {
  withDeadline,
  isPastDeadline,
  remainingMs,
  DeadlineExceededError,
  isDeadlineExceeded,
  PROVIDER_TIMEOUT_CHARGE_NOTE,
} from "@/lib/sourcing/search/discovery-inspect/deadline";
export {
  createMockDiscoveryInspectSearchClient,
  createMockValidateFetchImpl,
  mockHtmlForUrl,
} from "@/lib/sourcing/search/discovery-inspect/mock";
export {
  revalidateSelectedUrlsForImport,
  importSelectedDiscoveryInspectRows,
  importMayBeginPersistence,
} from "@/lib/sourcing/search/discovery-inspect/import-selected";
export {
  DISCOVERY_INSPECT_CONFIRM_FIELD,
  DISCOVERY_INSPECT_CONFIRM_VALUE,
  type DiscoveryInspectPreviewReport,
  type DiscoveryInspectPreviewRow,
} from "@/lib/sourcing/search/discovery-inspect/types";
