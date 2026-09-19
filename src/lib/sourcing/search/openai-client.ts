/**
 * Back-compat re-exports. Prefer `@/lib/sourcing/search/providers`.
 */
import "server-only";

export {
  getOpenAiApiKey,
  isOpenAiSearchConfigured,
  parseSearchPayloadJson,
  runOpenAiProviderSearch as runOpenAiWebSearch,
} from "@/lib/sourcing/search/providers/openai";

export { isLiveSearchConfigured } from "@/lib/sourcing/search/providers";
