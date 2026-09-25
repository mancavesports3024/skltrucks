/**
 * Mock Preview → Import-eligible demonstration (zero network, zero DB writes).
 * Also demonstrates Import revalidation rejecting hubs / never trusting client facts.
 *
 *   npx tsx scripts/mock-discovery-inspect-demo.mts
 */
import Module from "node:module";
import { writeFileSync } from "node:fs";

const originalLoad = (Module as unknown as { _load: Function })._load;
(Module as unknown as { _load: Function })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "server-only") return {};
  return originalLoad(request, parent, isMain);
};

async function main() {
  const {
    createMockDiscoveryInspectSearchClient,
    createMockValidateFetchImpl,
  } = await import("../src/lib/sourcing/search/discovery-inspect/mock.ts");
  const { runDiscoveryInspectPreview } = await import(
    "../src/lib/sourcing/search/discovery-inspect/preview.ts"
  );
  const { revalidateSelectedUrlsForImport } = await import(
    "../src/lib/sourcing/search/discovery-inspect/import-selected.ts"
  );
  const { DEFAULT_BUYING_PROFILE } = await import("../src/types/sourcing.ts");

  const preview = await runDiscoveryInspectPreview({
    profile: DEFAULT_BUYING_PROFILE,
    existingLeads: [],
    mode: "mock",
    confirmPaidProviders: true,
    tavilyClient: createMockDiscoveryInspectSearchClient(),
    allowLiveNetwork: false,
    validateFetchImpl: createMockValidateFetchImpl(),
  });

  const importable = preview.rows.filter((r) => r.importEligible);
  const selectedUrls = importable.slice(0, 2).map((r) => r.canonicalUrl || r.finalUrl);

  const revalidated = await revalidateSelectedUrlsForImport({
    selectedUrls: [
      ...selectedUrls,
      "https://www.justanswer.com/medium-and-heavy-truck/x.html",
      "https://evil.example/extra-truck-should-not-import",
    ],
    profile: DEFAULT_BUYING_PROFILE,
    existingLeads: [],
    fetchImpl: createMockValidateFetchImpl(),
    deadlineAt: Date.now() + 60_000,
  });

  const summary = {
    demonstration:
      "mock Preview → server Import revalidation (no DB writes, zero providers on Import)",
    mode: preview.mode,
    previewOnly: preview.previewOnly,
    dbWrites: preview.dbWrites,
    tavilyExtractCalled: preview.tavilyExtractCalled,
    openaiDiscoveryCalled: preview.openaiDiscoveryCalled,
    previewUsageLive: preview.usage.live,
    discovery: {
      queriesPlanned: preview.queryPlans.length,
      tavilyCredits: preview.tavilyCredits,
      tavilyEstimatedCostUsd: preview.tavilyEstimatedCostUsd,
      metrics: preview.discoveryMetrics,
      retained: preview.retained.length,
    },
    validationAndInspect: {
      validated: preview.validated.length,
      openAiInspectCalls: preview.openAiInspectCalls,
      combinedEstimatedCostUsd: preview.combinedEstimatedCostUsd,
    },
    rows: {
      total: preview.rows.length,
      importEligible: importable.length,
    },
    importRevalidation: {
      selectedUrlsSent: selectedUrls.length + 2,
      tavilyCalls: revalidated.tavilyCalls,
      openAiCalls: revalidated.openAiCalls,
      wouldImport: revalidated.trucks.map((t) => ({
        url: t.listingUrl,
        vin: t.vin,
        seller: t.seller,
      })),
      rejected: revalidated.rejected,
      note: "Import accepts URLs only; hubs/unsafe rejected; facts from re-fetch only",
    },
    ceilings: preview.ceilings,
    previewId: preview.previewId,
    generatedAt: preview.generatedAt,
  };

  const outPath =
    process.env.DEMO_OUT ||
    "/opt/cursor/artifacts/discovery-inspect-mock-preview-import-demo.json";
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  writeFileSync(
    "/opt/cursor/artifacts/discovery-inspect-tampered-import-demo.json",
    JSON.stringify(summary.importRevalidation, null, 2)
  );
  console.log(JSON.stringify(summary, null, 2));
  console.error(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
