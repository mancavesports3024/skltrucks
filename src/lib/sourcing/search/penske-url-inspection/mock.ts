/**
 * Mock inspect-only provider for Penske URL inspection tests (no network).
 */
import type { BuyingProfile } from "@/types/sourcing";
import type { SearchProviderResult } from "@/lib/sourcing/search/providers/types";
import type {
  ExtractedTruckCandidate,
  SearchModelPayload,
} from "@/lib/sourcing/search/types";

function mockTruckForUrl(listingUrl: string): ExtractedTruckCandidate {
  const unitMatch = listingUrl.match(/\/unit-(\d+)/i);
  const unit = unitMatch?.[1] ?? "000000";
  return {
    listingUrl,
    sourceName: "Penske Used Trucks",
    seller: "Penske Used Trucks",
    stockNumber: unit,
    vin: "",
    year: 2019,
    makeModel: "Freightliner M2",
    engine: "Cummins ISB 6.7",
    engineIsCummins: true,
    engineEvidence: "Engine: Cummins ISB 6.7",
    transmission: "Allison automatic",
    transmissionIsAutomatic: true,
    transmissionEvidence: "Transmission: Allison automatic",
    boxLengthFt: 26,
    boxLengthEvidence: "Load Length: 26'0\"",
    manufacturerGvwrLbs: 25500,
    listedWeightLbs: 25500,
    listedWeightTerm: "gvwr",
    gvwrEvidence: "GVWR 25500",
    mileage: 142000,
    hasLiftgate: true,
    askingPrice: 42900,
    auctionCurrentBid: null,
    location: "Dallas, TX",
    drivingDistanceMiles: null,
    distanceIsEstimate: true,
    phone: "1-866-309-1962",
    contactName: "",
    contactRole: "",
    evidenceUrl: listingUrl,
    notes: "mock penske inspect-only",
  };
}

export function runMockPenskeUrlInspection(
  _profile: BuyingProfile,
  listingUrls: string[],
  options?: { failUrl?: string }
): SearchProviderResult {
  const trucks: ExtractedTruckCandidate[] = [];
  const stageErrors: string[] = [];
  const notes: string[] = ["Mock Penske inspect-only (no network)."];

  for (const url of listingUrls) {
    if (options?.failUrl && url === options.failUrl) {
      stageErrors.push(`Inspection failed for ${url}: mock page malformed`);
      notes.push(`Rejected ${url}: mock page malformed`);
      continue;
    }
    trucks.push(mockTruckForUrl(url));
  }

  const payload: SearchModelPayload = {
    trucks,
    contacts: [
      {
        company: "Penske Used Trucks",
        phone: "1-866-309-1962",
        contactName: "",
        role: "Sales",
        email: "",
        sourceUrl: listingUrls[0] || "https://www.penskeusedtrucks.com/",
        supplierType: "fleet",
        evidenceQuote: "Call 1-866-309-1962",
        notes: "mock",
      },
    ],
    sourcesConsulted: [...listingUrls],
    queriesUsed: listingUrls.map((u) => `inspect:${u}`),
    notes: notes.join(" | "),
  };

  return {
    provider: "mock",
    payload,
    usage: {
      provider: "mock",
      model: "mock",
      webSearchCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      live: false,
      creditsConsumed: 0,
      searchesRun: 0,
      extractsRun: trucks.length,
    },
    rawText: JSON.stringify(payload, null, 2),
    queriesPlanned: payload.queriesUsed,
    stageErrors,
  };
}
