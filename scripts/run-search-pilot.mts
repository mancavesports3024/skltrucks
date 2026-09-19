/**
 * Controlled nonprod pilot dry-run (no DB writes, no paid API by default).
 *
 *   npx tsx scripts/run-search-pilot.mts
 *   npx tsx --env-file=.env.local scripts/run-search-pilot.mts --live
 *
 * --live only runs when TAVILY_API_KEY or OPENAI_API_KEY is set.
 * This script prints "set"/"missing" for key presence — never the key value.
 */
import { classifyLead } from "../src/lib/sourcing/match.ts";
import { evaluateSearchPayloadForTest } from "../src/lib/sourcing/search/evaluate.ts";
import {
  candidateToContactInput,
  candidateToTruckLeadInput,
} from "../src/lib/sourcing/search/map-candidates.ts";
import { MOCK_SEARCH_PAYLOAD, MOCK_SEARCH_USAGE } from "../src/lib/sourcing/search/mocks.ts";
import { buildSearchQueriesFromProfile } from "../src/lib/sourcing/search/queries.ts";
import { DEFAULT_BUYING_PROFILE } from "../src/types/sourcing.ts";

const wantLive = process.argv.includes("--live");

async function main() {
  const profile = DEFAULT_BUYING_PROFILE;
  const tavilyPresent = Boolean(process.env.TAVILY_API_KEY?.trim());
  const openAiPresent = Boolean(process.env.OPENAI_API_KEY?.trim());

  console.log("=== Internet Search Pilot (nonprod) ===");
  console.log("TAVILY_API_KEY:", tavilyPresent ? "set" : "missing");
  console.log("OPENAI_API_KEY:", openAiPresent ? "set" : "missing");

  if (wantLive && !tavilyPresent && !openAiPresent) {
    console.error("Live requested but no live search key is set — refusing.");
    process.exit(2);
  }

  let payload = {
    ...MOCK_SEARCH_PAYLOAD,
    queriesUsed: buildSearchQueriesFromProfile(profile),
  };
  let usage = { ...MOCK_SEARCH_USAGE };
  let mode = "mock";

  if (wantLive && (tavilyPresent || openAiPresent)) {
    const { runInternetSearch } = await import("../src/lib/sourcing/search/providers/index.ts");
    const search = await runInternetSearch(profile, { forceMock: false });
    payload = search.payload;
    usage = search.usage;
    mode = search.provider;
  }

  console.log("Mode:", mode);
  console.log("\nQueries from buying profile:");
  for (const q of payload.queriesUsed.length
    ? payload.queriesUsed
    : buildSearchQueriesFromProfile(profile)) {
    console.log(" -", q);
  }

  const evaluated = evaluateSearchPayloadForTest(profile, payload);

  console.log("\n--- API usage ---");
  console.log(
    JSON.stringify(
      {
        provider: usage.provider,
        creditsConsumed: usage.creditsConsumed,
        searchesRun: usage.searchesRun,
        extractsRun: usage.extractsRun,
        estimatedCostUsd: usage.estimatedCostUsd,
        live: usage.live,
      },
      null,
      2
    )
  );

  console.log("\n--- Trucks (would save) ---");
  for (const truck of payload.trucks) {
    const mapped = candidateToTruckLeadInput(truck);
    if (mapped.rejectReason) {
      console.log(`REJECT ${truck.listingUrl} — ${mapped.rejectReason}`);
      continue;
    }
    const match = classifyLead(mapped.input, profile, new Date("2026-09-19"));
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
      outcome: evaluated.trucks.find((t) => t.listingUrl === mapped.input.sourceUrl)?.outcome,
    });
  }

  console.log("\n--- Contacts / call routes ---");
  for (const c of payload.contacts) {
    const mapped = candidateToContactInput(c);
    if (mapped.rejectReason) {
      console.log(`REJECT ${c.company} — ${mapped.rejectReason}`);
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
    provider: usage.provider,
    creditsConsumed: usage.creditsConsumed,
    resultsExamined: payload.trucks.length + payload.contacts.length,
    trucksKept: evaluated.trucks.filter((t) => t.outcome !== "rejected").length,
    contactsKept: evaluated.contacts.filter((c) => c.outcome === "inserted").length,
  });

  if (!wantLive) {
    console.log("\nLive API not called (mock dry-run). Configure TAVILY_API_KEY for live pilot.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Pilot failed");
  process.exit(1);
});
