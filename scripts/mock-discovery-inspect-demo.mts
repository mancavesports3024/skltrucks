/**
 * Mock Preview → Import-eligible demonstration (zero network, zero DB writes).
 * Does not call Tavily/OpenAI or persist leads.
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
  const rejectedDefault = preview.rows.filter(
    (r) => r.previewOutcome === "does_not_match" || r.previewOutcome === "rejected_pre_inspect"
  );
  const selectedIds = importable.slice(0, 2).map((r) => r.id);
  const selectedForImport = importable.filter((r) => selectedIds.includes(r.id));

  const summary = {
    demonstration: "mock Preview → Import-eligible selection (no DB writes)",
    mode: preview.mode,
    previewOnly: preview.previewOnly,
    dbWrites: preview.dbWrites,
    tavilyExtractCalled: preview.tavilyExtractCalled,
    openaiDiscoveryCalled: preview.openaiDiscoveryCalled,
    discovery: {
      queriesPlanned: preview.queryPlans.length,
      tavilyCredits: preview.tavilyCredits,
      tavilyEstimatedCostUsd: preview.tavilyEstimatedCostUsd,
      metrics: preview.discoveryMetrics,
      retained: preview.retained.length,
      retainedUrls: preview.retained.map((r) => ({
        url: r.canonicalUrl || r.rawUrl,
        bucket: r.bucket,
      })),
      rejectedBeforeInspect: preview.rejectedBeforeInspect.length,
      rejectedReasons: [...new Set(preview.rejectedBeforeInspect.map((r) => r.reason))].slice(
        0,
        12
      ),
    },
    validationAndInspect: {
      validated: preview.validated.length,
      openAiInspectCalls: preview.openAiInspectCalls,
      openAiEstimatedCostUsd: preview.openAiEstimatedCostUsd,
      combinedEstimatedCostUsd: preview.combinedEstimatedCostUsd,
    },
    rows: {
      total: preview.rows.length,
      confirmed: preview.rows.filter((r) => r.previewOutcome === "confirmed_match").length,
      needsVerification: preview.rows.filter((r) => r.previewOutcome === "needs_verification")
        .length,
      rejectedOrMismatch: rejectedDefault.length,
      duplicates: preview.rows.filter((r) => r.previewOutcome === "duplicate").length,
      unverified: preview.rows.filter((r) => r.previewOutcome === "unverified").length,
      importEligible: importable.length,
    },
    importDemo: {
      note: "Import not executed — requires staff click + auth + applySearchProviderResult. Showing selection only.",
      selectedIds,
      wouldImport: selectedForImport.map((r) => ({
        id: r.id,
        finalUrl: r.finalUrl,
        outcome: r.previewOutcome,
        vin: r.truck?.vin ?? null,
        year: r.truck?.year ?? null,
        make: r.truck?.make ?? null,
        model: r.truck?.model ?? null,
        sellerPhone: r.contact?.phone ?? null,
      })),
      blockedFromImportByDefault: preview.rows
        .filter((r) => !r.importEligible)
        .slice(0, 8)
        .map((r) => ({
          finalUrl: r.finalUrl,
          outcome: r.previewOutcome,
          reason: r.reasons[0] ?? r.validationReason,
        })),
    },
    ceilings: preview.ceilings,
    previewId: preview.previewId,
    generatedAt: preview.generatedAt,
  };

  const outPath =
    process.env.DEMO_OUT ||
    "/opt/cursor/artifacts/discovery-inspect-mock-preview-import-demo.json";
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.error(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
