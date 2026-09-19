/**
 * Controlled nonprod pilot: evaluate mock search payload (no DB writes).
 * Live OpenAI runs require OPENAI_API_KEY and `--live` (skipped when key missing).
 *
 *   npx tsx scripts/run-search-pilot.mts
 *   npx tsx --env-file=.env.local scripts/run-search-pilot.mts --live
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
  const keyPresent = Boolean(process.env.OPENAI_API_KEY?.trim());

  console.log("=== Internet Search Pilot (nonprod) ===");
  console.log("OPENAI_API_KEY:", keyPresent ? "set" : "missing");

  if (wantLive && !keyPresent) {
    console.error("Live requested but OPENAI_API_KEY is missing — refusing live call.");
    process.exit(2);
  }

  let payload = {
    ...MOCK_SEARCH_PAYLOAD,
    queriesUsed: buildSearchQueriesFromProfile(profile),
  };
  let usage = { ...MOCK_SEARCH_USAGE, live: false };
  let mode = "mock";

  if (wantLive && keyPresent) {
    // Dynamic import keeps server-only out of the default mock path.
    const { runOpenAiWebSearch } = await import("../src/lib/sourcing/search/openai-client.ts");
    const search = await runOpenAiWebSearch(profile, { forceMock: false });
    payload = search.payload;
    usage = search.usage;
    mode = "live";
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
  console.log(JSON.stringify(usage, null, 2));

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
      contactName: truck.contactName || null,
      price: mapped.input.price,
      location: mapped.input.location,
      distanceMi: mapped.input.drivingDistanceMiles,
      distanceIsEstimate: mapped.input.distanceIsEstimate,
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
      contactName: mapped.input.contactName || null,
      role: mapped.input.role || null,
      sourceUrl: mapped.input.sourceUrl,
    });
  }

  console.log("\n--- Summary ---");
  console.log({
    resultsExamined: payload.trucks.length + payload.contacts.length,
    trucksKept: evaluated.trucks.filter((t) => t.outcome !== "rejected").length,
    trucksRejected: evaluated.rejected,
    contactsKept: evaluated.contacts.filter((c) => c.outcome === "inserted").length,
    confirmed: evaluated.trucks.filter((t) => t.matchStatus === "confirmed_match").length,
    needsVerification: evaluated.trucks.filter((t) => t.matchStatus === "needs_verification")
      .length,
    live: usage.live,
    estimatedCostUsd: usage.estimatedCostUsd,
  });

  if (wantLive && keyPresent) {
    console.log("\n(Live API call completed — results above.)");
  } else if (!keyPresent) {
    console.log("\nLive test skipped: OPENAI_API_KEY not available in this environment.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
