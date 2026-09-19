/**
 * One-shot live Tavily pilot (no DB writes). Stubs server-only for CLI use.
 * Never prints API key values.
 */
import Module from "node:module";

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
  const { runTavilySearch } = await import("../src/lib/sourcing/search/providers/tavily.ts");
  const { evaluateSearchPayloadForTest } = await import(
    "../src/lib/sourcing/search/evaluate.ts"
  );
  const { candidateToTruckLeadInput, candidateToContactInput } = await import(
    "../src/lib/sourcing/search/map-candidates.ts"
  );
  const { classifyLead } = await import("../src/lib/sourcing/match.ts");
  const { DEFAULT_BUYING_PROFILE } = await import("../src/types/sourcing.ts");

  if (!process.env.TAVILY_API_KEY?.trim()) {
    console.error("TAVILY_API_KEY missing — aborting.");
    process.exit(2);
  }

  console.log("=== Live Tavily pilot ===");
  console.log("TAVILY_API_KEY: set");

  const search = await runTavilySearch(DEFAULT_BUYING_PROFILE);
  const evaluated = evaluateSearchPayloadForTest(DEFAULT_BUYING_PROFILE, search.payload);

  console.log("\n--- Usage ---");
  console.log(
    JSON.stringify(
      {
        provider: search.usage.provider,
        creditsConsumed: search.usage.creditsConsumed,
        searchesRun: search.usage.searchesRun,
        extractsRun: search.usage.extractsRun,
        estimatedCostUsd: search.usage.estimatedCostUsd,
      },
      null,
      2
    )
  );

  console.log("\n--- Queries ---");
  for (const q of search.payload.queriesUsed) console.log(" -", q);

  console.log("\n--- Sources ---");
  console.log(search.payload.sourcesConsulted.join(", ") || "(none)");

  console.log("\n--- Trucks ---");
  for (const truck of search.payload.trucks) {
    const mapped = candidateToTruckLeadInput(truck);
    if (mapped.rejectReason) {
      console.log("REJECT", truck.listingUrl, "-", mapped.rejectReason);
      continue;
    }
    const match = classifyLead(mapped.input, DEFAULT_BUYING_PROFILE, new Date());
    console.log({
      seller: mapped.input.seller,
      stock: mapped.input.stockNumber,
      vin: mapped.input.vin || null,
      year: mapped.input.year,
      makeModel: mapped.input.makeModel,
      listingUrl: mapped.input.sourceUrl,
      phone: truck.phone || null,
      price: mapped.input.price,
      location: mapped.input.location,
      matchStatus: match.status,
    });
  }

  console.log("\n--- Contacts ---");
  for (const c of search.payload.contacts) {
    const mapped = candidateToContactInput(c);
    if (mapped.rejectReason) {
      console.log("REJECT", c.company, "-", mapped.rejectReason);
      continue;
    }
    console.log({
      company: mapped.input.company,
      phone: mapped.input.phone,
      sourceUrl: mapped.input.sourceUrl,
    });
  }

  console.log("\n--- Summary ---");
  console.log({
    trucksFound: search.payload.trucks.length,
    contactsFound: search.payload.contacts.length,
    trucksKept: evaluated.trucks.filter((t) => t.outcome !== "rejected").length,
    contactsKept: evaluated.contacts.filter((c) => c.outcome === "inserted").length,
    credits: search.usage.creditsConsumed,
    notes: search.payload.notes,
  });
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg.replace(/tvly-[A-Za-z0-9_-]+/gi, "[redacted]"));
  process.exit(1);
});
