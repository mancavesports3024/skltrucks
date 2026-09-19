import "server-only";

import { buildSearchQueriesFromProfile } from "@/lib/sourcing/search/queries";
import { MOCK_SEARCH_PAYLOAD, MOCK_SEARCH_USAGE } from "@/lib/sourcing/search/mocks";
import type { SearchProviderFn } from "@/lib/sourcing/search/providers/types";

export const runMockSearch: SearchProviderFn = async (profile) => {
  const queriesPlanned = buildSearchQueriesFromProfile(profile);
  return {
    provider: "mock",
    payload: {
      ...MOCK_SEARCH_PAYLOAD,
      queriesUsed: queriesPlanned,
    },
    usage: { ...MOCK_SEARCH_USAGE },
    rawText: JSON.stringify(MOCK_SEARCH_PAYLOAD, null, 2),
    queriesPlanned,
  };
};
