import "server-only";

import OpenAI from "openai";
import { emptyFieldEvidence } from "@/lib/sourcing/market-comparison/evidence";
import {
  MARKET_COMPARISON_MAX_TOOL_CALLS,
  MARKET_COMPARISON_TARGET_VERIFIED_MAX,
  MARKET_COMPARISON_TARGET_VERIFIED_MIN,
  type ComparableListingRaw,
  type LeadComparisonSnapshot,
} from "@/lib/sourcing/market-comparison/types";
import {
  getOpenAiApiKey,
  getOpenAiSearchModel,
  type OpenAiResponsesClient,
  countWebSearchCalls,
  extractOutputText,
} from "@/lib/sourcing/search/providers/openai";
import { sanitizeProviderError, estimateOpenAiSearchCostUsd, type SearchApiUsage } from "@/lib/sourcing/search/types";

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function asBool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
}

function asStr(v: unknown): string {
  return String(v ?? "").trim();
}

export function parseComparableListingsJson(raw: string): {
  listings: ComparableListingRaw[];
  queriesUsed: string[];
  sourcesConsulted: string[];
  notes: string;
  parseError?: string;
} {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rows = Array.isArray(parsed.comparables)
      ? parsed.comparables
      : Array.isArray(parsed.listings)
        ? parsed.listings
        : [];
    const listings: ComparableListingRaw[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const fe =
        r.fieldEvidence && typeof r.fieldEvidence === "object"
          ? (r.fieldEvidence as Record<string, unknown>)
          : r.field_evidence && typeof r.field_evidence === "object"
            ? (r.field_evidence as Record<string, unknown>)
            : {};
      listings.push({
        listingUrl: asStr(r.listingUrl ?? r.listing_url ?? r.url),
        sourceName: asStr(r.sourceName ?? r.source_name ?? r.source),
        year: asNum(r.year),
        makeModel: asStr(r.makeModel ?? r.make_model),
        mileage: asNum(r.mileage),
        askingPrice: asNum(r.askingPrice ?? r.asking_price ?? r.price),
        auctionCurrentBid: asNum(r.auctionCurrentBid ?? r.auction_current_bid),
        boxLengthFt: asNum(r.boxLengthFt ?? r.box_length_ft),
        bodyType: asStr(r.bodyType ?? r.body_type),
        engine: asStr(r.engine),
        engineIsCummins: asBool(r.engineIsCummins ?? r.engine_is_cummins),
        transmission: asStr(r.transmission),
        transmissionIsAutomatic: asBool(
          r.transmissionIsAutomatic ?? r.transmission_is_automatic
        ),
        manufacturerGvwrLbs: asNum(r.manufacturerGvwrLbs ?? r.manufacturer_gvwr_lbs ?? r.gvwr),
        hasLiftgate: asBool(r.hasLiftgate ?? r.has_liftgate),
        location: asStr(r.location),
        conditionNotes: asStr(r.conditionNotes ?? r.condition_notes),
        statusNotes: asStr(r.statusNotes ?? r.status_notes),
        evidenceNotes: asStr(r.evidenceNotes ?? r.evidence_notes ?? r.notes),
        vin: asStr(r.vin),
        stockNumber: asStr(r.stockNumber ?? r.stock_number),
        listingPageInspected: asBool(r.listingPageInspected ?? r.listing_page_inspected) === true,
        fieldEvidence: emptyFieldEvidence({
          askingPrice: asStr(fe.askingPrice ?? fe.asking_price),
          year: asStr(fe.year),
          makeModel: asStr(fe.makeModel ?? fe.make_model),
          mileage: asStr(fe.mileage),
        }),
      });
    }
    return {
      listings,
      queriesUsed: Array.isArray(parsed.queriesUsed)
        ? parsed.queriesUsed.map(asStr).filter(Boolean)
        : [],
      sourcesConsulted: Array.isArray(parsed.sourcesConsulted)
        ? parsed.sourcesConsulted.map(asStr).filter(Boolean)
        : [],
      notes: asStr(parsed.notes),
    };
  } catch (e) {
    return {
      listings: [],
      queriesUsed: [],
      sourcesConsulted: [],
      notes: "",
      parseError: sanitizeProviderError(e),
    };
  }
}

function comparisonSchema() {
  return {
    type: "json_schema" as const,
    name: "market_comparables",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["comparables", "queriesUsed", "sourcesConsulted", "notes"],
      properties: {
        queriesUsed: { type: "array", items: { type: "string" } },
        sourcesConsulted: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
        comparables: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "listingUrl",
              "sourceName",
              "year",
              "makeModel",
              "mileage",
              "askingPrice",
              "auctionCurrentBid",
              "boxLengthFt",
              "bodyType",
              "engine",
              "engineIsCummins",
              "transmission",
              "transmissionIsAutomatic",
              "manufacturerGvwrLbs",
              "hasLiftgate",
              "location",
              "conditionNotes",
              "statusNotes",
              "evidenceNotes",
              "vin",
              "stockNumber",
              "listingPageInspected",
              "fieldEvidence",
            ],
            properties: {
              listingUrl: { type: "string" },
              sourceName: { type: "string" },
              year: { type: ["integer", "null"] },
              makeModel: { type: "string" },
              mileage: { type: ["number", "null"] },
              askingPrice: { type: ["number", "null"] },
              auctionCurrentBid: { type: ["number", "null"] },
              boxLengthFt: { type: ["number", "null"] },
              bodyType: { type: "string" },
              engine: { type: "string" },
              engineIsCummins: { type: ["boolean", "null"] },
              transmission: { type: "string" },
              transmissionIsAutomatic: { type: ["boolean", "null"] },
              manufacturerGvwrLbs: { type: ["integer", "null"] },
              hasLiftgate: { type: ["boolean", "null"] },
              location: { type: "string" },
              conditionNotes: { type: "string" },
              statusNotes: { type: "string" },
              evidenceNotes: { type: "string" },
              vin: { type: "string" },
              stockNumber: { type: "string" },
              listingPageInspected: { type: "boolean" },
              fieldEvidence: {
                type: "object",
                additionalProperties: false,
                required: ["askingPrice", "year", "makeModel", "mileage"],
                properties: {
                  askingPrice: { type: "string" },
                  year: { type: "string" },
                  makeModel: { type: "string" },
                  mileage: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  };
}

export type MarketComparisonProviderResult = {
  listings: ComparableListingRaw[];
  queriesUsed: string[];
  sourcesConsulted: string[];
  notes: string;
  apiUsage: SearchApiUsage;
  error?: string;
};

/**
 * OpenAI web-search comparable discovery for one lead.
 * Never invents specs; staff must confirm. max_tool_calls capped.
 * Expects about 3–6 verified individual listings — not a promise of 5–10.
 */
export async function runOpenAiMarketComparableSearch(
  lead: LeadComparisonSnapshot,
  options?: {
    client?: OpenAiResponsesClient;
    maxToolCalls?: number;
  }
): Promise<MarketComparisonProviderResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey && !options?.client) {
    return {
      listings: [],
      queriesUsed: [],
      sourcesConsulted: [],
      notes: "",
      apiUsage: {
        provider: "openai",
        model: getOpenAiSearchModel(),
        webSearchCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        live: false,
        creditsConsumed: 0,
      },
      error: "OpenAI API key is not configured.",
    };
  }

  const client: OpenAiResponsesClient =
    options?.client ??
    (new OpenAI({ apiKey }) as unknown as OpenAiResponsesClient);

  const maxToolCalls = Math.max(
    1,
    Math.min(
      options?.maxToolCalls ?? MARKET_COMPARISON_MAX_TOOL_CALLS,
      MARKET_COMPARISON_MAX_TOOL_CALLS
    )
  );

  const prompt = [
    `Find ${MARKET_COMPARISON_TARGET_VERIFIED_MIN}–${MARKET_COMPARISON_TARGET_VERIFIED_MAX} current public individual medium-duty box truck listings comparable to this subject truck.`,
    "Prefer Commercial Truck Trader, TruckPaper, SOARR, and individual dealer inventory unit pages.",
    "Return ONLY individual listing URLs — never search hubs, category pages, or invented URLs.",
    "You MUST open/inspect each individual listing page before including it. Search-result snippets alone are insufficient.",
    "For each comparable set listingPageInspected=true and fieldEvidence quotes that literally support askingPrice, year, makeModel, and mileage from THAT same URL.",
    "Never attach a price or mileage to a URL by result position or inference.",
    "Include VIN and stockNumber when shown on the page (empty string if unknown).",
    "Do not invent missing specifications. Use null when unknown.",
    "Exclude salvage, reefers, manuals, >26000 GVWR, cab/chassis without box, and auctions without asking price.",
    "Do not claim availability unless the individual page supports it.",
    "Subject truck:",
    JSON.stringify({
      year: lead.year,
      makeModel: lead.makeModel,
      mileage: lead.mileage,
      askingOrWholesalePrice: lead.price,
      boxLengthFt: lead.boxLengthFt,
      engine: lead.engine,
      engineIsCummins: lead.engineIsCummins,
      transmission: lead.transmission,
      transmissionIsAutomatic: lead.transmissionIsAutomatic,
      manufacturerGvwrLbs: lead.manufacturerGvwrLbs,
      hasLiftgate: lead.hasLiftgate,
      location: lead.location,
    }),
  ].join("\n");

  const acc = { webSearchCalls: 0, inputTokens: 0, outputTokens: 0 };
  try {
    const response = await client.responses.create({
      model: getOpenAiSearchModel(),
      tools: [{ type: "web_search_preview" }],
      max_tool_calls: maxToolCalls,
      input: prompt,
      text: { format: comparisonSchema() },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    acc.webSearchCalls += countWebSearchCalls(response);
    acc.inputTokens += response.usage?.input_tokens ?? 0;
    acc.outputTokens += response.usage?.output_tokens ?? 0;

    const raw = extractOutputText(response);
    const parsed = parseComparableListingsJson(raw);
    const apiUsage: SearchApiUsage = {
      provider: "openai",
      model: getOpenAiSearchModel(),
      webSearchCalls: acc.webSearchCalls,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      estimatedCostUsd: estimateOpenAiSearchCostUsd(acc),
      live: true,
      creditsConsumed: 0,
      searchesRun: acc.webSearchCalls,
      extractsRun: 0,
    };

    if (parsed.parseError) {
      return {
        listings: [],
        queriesUsed: parsed.queriesUsed,
        sourcesConsulted: parsed.sourcesConsulted,
        notes: parsed.notes,
        apiUsage,
        error: `Invalid structured output from provider: ${parsed.parseError}`,
      };
    }

    return {
      listings: parsed.listings,
      queriesUsed: parsed.queriesUsed,
      sourcesConsulted: parsed.sourcesConsulted,
      notes: parsed.notes,
      apiUsage,
    };
  } catch (e) {
    return {
      listings: [],
      queriesUsed: [],
      sourcesConsulted: [],
      notes: "",
      apiUsage: {
        provider: "openai",
        model: getOpenAiSearchModel(),
        webSearchCalls: acc.webSearchCalls,
        inputTokens: acc.inputTokens,
        outputTokens: acc.outputTokens,
        estimatedCostUsd: estimateOpenAiSearchCostUsd(acc),
        live: true,
        creditsConsumed: 0,
      },
      error: sanitizeProviderError(e),
    };
  }
}
