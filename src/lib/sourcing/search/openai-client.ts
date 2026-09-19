import "server-only";

import OpenAI from "openai";
import type { BuyingProfile } from "@/types/sourcing";
import {
  buyingProfilePromptBlock,
  buildSearchQueriesFromProfile,
} from "@/lib/sourcing/search/queries";
import type { SearchApiUsage, SearchModelPayload } from "@/lib/sourcing/search/types";
import { estimateSearchCostUsd } from "@/lib/sourcing/search/types";
import { MOCK_SEARCH_PAYLOAD, MOCK_SEARCH_USAGE } from "@/lib/sourcing/search/mocks";

const DEFAULT_MODEL = process.env.OPENAI_SEARCH_MODEL?.trim() || "gpt-4o-mini";
const MAX_TOOL_CALLS = Number(process.env.OPENAI_SEARCH_MAX_TOOL_CALLS || "6");

export function getOpenAiApiKey(): string | undefined {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || undefined;
}

export function isLiveSearchConfigured(): boolean {
  return Boolean(getOpenAiApiKey());
}

function extractOutputText(response: OpenAI.Responses.Response): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function countWebSearchCalls(response: OpenAI.Responses.Response): number {
  let n = 0;
  for (const item of response.output ?? []) {
    if (item.type === "web_search_call") {
      const action = (item as { action?: { type?: string } }).action;
      if (!action || action.type === "search") n += 1;
    }
  }
  return n;
}

export function parseSearchPayloadJson(raw: string): SearchModelPayload {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  // Find outermost object if model added prose
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model did not return JSON object.");
  }
  const parsed = JSON.parse(jsonText.slice(start, end + 1)) as SearchModelPayload;
  return {
    trucks: Array.isArray(parsed.trucks) ? parsed.trucks : [],
    contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
    sourcesConsulted: Array.isArray(parsed.sourcesConsulted) ? parsed.sourcesConsulted : [],
    queriesUsed: Array.isArray(parsed.queriesUsed) ? parsed.queriesUsed : [],
    notes: String(parsed.notes ?? ""),
  };
}

export interface OpenAiSearchResult {
  payload: SearchModelPayload;
  usage: SearchApiUsage;
  rawText: string;
  queriesPlanned: string[];
}

/**
 * Call OpenAI Responses API with hosted web_search.
 * Server-only — never import from client components.
 */
export async function runOpenAiWebSearch(
  profile: BuyingProfile,
  options?: { forceMock?: boolean }
): Promise<OpenAiSearchResult> {
  const queriesPlanned = buildSearchQueriesFromProfile(profile);

  if (options?.forceMock || !isLiveSearchConfigured()) {
    return {
      payload: {
        ...MOCK_SEARCH_PAYLOAD,
        queriesUsed: queriesPlanned,
      },
      usage: { ...MOCK_SEARCH_USAGE, live: false },
      rawText: JSON.stringify(MOCK_SEARCH_PAYLOAD, null, 2),
      queriesPlanned,
    };
  }

  const client = new OpenAI({ apiKey: getOpenAiApiKey() });
  const profileBlock = buyingProfilePromptBlock(profile);
  const maxToolCalls = Number.isFinite(MAX_TOOL_CALLS) ? MAX_TOOL_CALLS : 6;

  // max_tool_calls is supported by the Responses API; SDK 7.19 types omit it on create params.
  const response = (await client.responses.create({
    model: DEFAULT_MODEL,
    tools: [{ type: "web_search" }],
    tool_choice: "auto",
    max_tool_calls: maxToolCalls,
    include: ["web_search_call.action.sources"],
    stream: false,
    input: [
      {
        role: "system",
        content:
          "You are SKL Trucks' private sourcing research assistant. Return ONLY valid JSON matching the schema. Prefer individual listing pages with a usable seller phone. Reject category/search result pages.",
      },
      {
        role: "user",
        content: [
          profileBlock,
          "",
          "Suggested search queries (use web_search; you may refine):",
          ...queriesPlanned.map((q, i) => `${i + 1}. ${q}`),
          "",
          "Return JSON with this shape:",
          `{
  "trucks": [{
    "listingUrl": "https://...",
    "sourceName": "...",
    "seller": "...",
    "stockNumber": "",
    "vin": "",
    "year": 2019,
    "makeModel": "Freightliner M2 106",
    "engine": "",
    "engineIsCummins": null,
    "engineEvidence": "",
    "transmission": "",
    "transmissionIsAutomatic": null,
    "transmissionEvidence": "",
    "boxLengthFt": null,
    "boxLengthEvidence": "",
    "manufacturerGvwrLbs": null,
    "listedWeightLbs": null,
    "listedWeightTerm": "unknown",
    "gvwrEvidence": "",
    "mileage": null,
    "hasLiftgate": null,
    "askingPrice": null,
    "auctionCurrentBid": null,
    "location": "",
    "drivingDistanceMiles": null,
    "distanceIsEstimate": true,
    "phone": "",
    "contactName": "",
    "contactRole": "",
    "evidenceUrl": "",
    "notes": ""
  }],
  "contacts": [{
    "company": "",
    "contactName": "",
    "role": "",
    "phone": "",
    "email": "",
    "sourceUrl": "",
    "supplierType": "",
    "evidenceQuote": "",
    "notes": ""
  }],
  "sourcesConsulted": ["hostname1"],
  "queriesUsed": ["..."],
  "notes": ""
}`,
          "Include up to 8 trucks and 6 contacts. Skip anything without a direct individual listing URL (for trucks) or a publicly verified business phone (for contacts).",
        ].join("\n"),
      },
    ],
  } as OpenAI.Responses.ResponseCreateParamsNonStreaming & {
    max_tool_calls?: number;
  })) as OpenAI.Responses.Response;

  const rawText = extractOutputText(response);
  const payload = parseSearchPayloadJson(rawText);
  const webSearchCalls = countWebSearchCalls(response);
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  return {
    payload: {
      ...payload,
      queriesUsed: payload.queriesUsed.length ? payload.queriesUsed : queriesPlanned,
    },
    usage: {
      model: DEFAULT_MODEL,
      webSearchCalls,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateSearchCostUsd({
        webSearchCalls,
        inputTokens,
        outputTokens,
      }),
      live: true,
    },
    rawText,
    queriesPlanned,
  };
}
