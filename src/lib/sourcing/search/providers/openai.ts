import "server-only";

import OpenAI from "openai";
import type { BuyingProfile } from "@/types/sourcing";
import {
  buyingProfilePromptBlock,
  buildSearchQueriesFromProfile,
} from "@/lib/sourcing/search/queries";
import {
  parseDiscoveryPayloadJson,
  parseInspectPayloadJson,
  parseSearchPayloadJson,
} from "@/lib/sourcing/search/openai-normalize";
import type { SearchProviderFn, SearchProviderResult } from "@/lib/sourcing/search/providers/types";
import type {
  ExtractedContactCandidate,
  ExtractedTruckCandidate,
  SearchModelPayload,
} from "@/lib/sourcing/search/types";
import {
  estimateOpenAiSearchCostUsd,
  sanitizeProviderError,
} from "@/lib/sourcing/search/types";

export { parseSearchPayloadJson } from "@/lib/sourcing/search/openai-normalize";

const DEFAULT_MODEL = process.env.OPENAI_SEARCH_MODEL?.trim() || "gpt-4o-mini";
const MAX_TOOL_CALLS = Number(process.env.OPENAI_SEARCH_MAX_TOOL_CALLS || "6");

export function getOpenAiApiKey(): string | undefined {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || undefined;
}

export function isOpenAiSearchConfigured(): boolean {
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

async function createResponse(
  client: OpenAI,
  input: OpenAI.Responses.ResponseCreateParamsNonStreaming["input"],
  maxToolCalls: number
): Promise<OpenAI.Responses.Response> {
  return (await client.responses.create({
    model: DEFAULT_MODEL,
    tools: [{ type: "web_search" }],
    tool_choice: "auto",
    max_tool_calls: maxToolCalls,
    include: ["web_search_call.action.sources"],
    stream: false,
    input,
  } as OpenAI.Responses.ResponseCreateParamsNonStreaming & {
    max_tool_calls?: number;
  })) as OpenAI.Responses.Response;
}

/**
 * Two-stage OpenAI web_search pilot:
 * 1) Discover individual listing URLs
 * 2) Inspect each URL → exactly one structured truck with listingUrl === supplied URL
 *
 * Never associates sourcesConsulted[i] with trucks[i] by position.
 */
export async function runOpenAiProviderSearch(
  profile: BuyingProfile
): Promise<SearchProviderResult> {
  if (!isOpenAiSearchConfigured()) {
    throw new Error("OpenAI search is not configured.");
  }

  const queriesPlanned = buildSearchQueriesFromProfile(profile);
  const client = new OpenAI({ apiKey: getOpenAiApiKey() });
  const profileBlock = buyingProfilePromptBlock(profile);
  const budget = Number.isFinite(MAX_TOOL_CALLS) ? Math.max(1, MAX_TOOL_CALLS) : 6;

  let webSearchCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const rawParts: string[] = [];
  const notes: string[] = [];
  const trucks: ExtractedTruckCandidate[] = [];
  const contacts: ExtractedContactCandidate[] = [];
  const sourcesConsulted: string[] = [];
  const queriesUsed: string[] = [];

  try {
    // --- Stage 1: discovery (reserve at least 1 call for inspect when budget > 1) ---
    const stage1Budget = budget <= 1 ? 1 : Math.min(2, budget - 1);
    const discoveryResponse = await createResponse(
      client,
      [
        {
          role: "system",
          content:
            "You discover CURRENT individual commercial box-truck listing URLs for SKL. Return ONLY JSON. Do not invent URLs. Prefer dealer/fleet/marketplace unit pages — never category/search hubs.",
        },
        {
          role: "user",
          content: [
            profileBlock,
            "",
            "Use web_search with these suggested queries (you may refine):",
            ...queriesPlanned.map((q, i) => `${i + 1}. ${q}`),
            "",
            "Return JSON exactly:",
            `{
  "listingUrls": ["https://...individual-unit-page...", "..."],
  "queriesUsed": ["..."],
  "sourcesConsulted": ["https://..."],
  "notes": ""
}`,
            "listingUrls must be direct individual vehicle pages only.",
            "Do not return truck specs in this stage — URLs only.",
            "Maximum 4 listingUrls.",
          ].join("\n"),
        },
      ],
      stage1Budget
    );

    webSearchCalls += countWebSearchCalls(discoveryResponse);
    inputTokens += discoveryResponse.usage?.input_tokens ?? 0;
    outputTokens += discoveryResponse.usage?.output_tokens ?? 0;
    const discoveryRaw = extractOutputText(discoveryResponse);
    rawParts.push("--- stage1 discovery ---\n" + discoveryRaw);

    const discovery = parseDiscoveryPayloadJson(discoveryRaw);
    queriesUsed.push(...(discovery.queriesUsed.length ? discovery.queriesUsed : queriesPlanned.slice(0, 1)));
    sourcesConsulted.push(...discovery.sourcesConsulted, ...discovery.listingUrls);
    if (discovery.notes) notes.push("discovery: " + discovery.notes);

    const remaining = Math.max(0, budget - webSearchCalls);
    const urlsToInspect = discovery.listingUrls.slice(0, remaining);

    if (urlsToInspect.length === 0) {
      notes.push(
        "Stage 1 returned no usable individual listingUrls; nothing to inspect. Untied sourcesConsulted were not turned into trucks."
      );
    }

    // --- Stage 2: inspect each URL independently ---
    for (const suppliedUrl of urlsToInspect) {
      if (webSearchCalls >= budget) break;
      const inspectBudget = 1;
      const inspectResponse = await createResponse(
        client,
        [
          {
            role: "system",
            content:
              "You inspect ONE truck listing page. Return ONLY JSON. Never invent phones, VINs, prices, or specs. GVW is not GVWR. listingUrl MUST be copied verbatim from the supplied URL.",
          },
          {
            role: "user",
            content: [
              profileBlock,
              "",
              `Inspect this exact listing URL (use web_search / browse as needed):`,
              suppliedUrl,
              "",
              "Return JSON exactly:",
              `{
  "truck": {
    "listingUrl": "${suppliedUrl}",
    "sourceName": "",
    "seller": "",
    "stockNumber": "",
    "vin": "",
    "year": null,
    "makeModel": "",
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
    "evidenceUrl": "${suppliedUrl}",
    "notes": ""
  },
  "contact": {
    "companyName": "",
    "contactName": "",
    "role": "",
    "phone": "",
    "email": "",
    "sourceUrl": "",
    "supplierType": "",
    "evidenceQuote": "",
    "notes": ""
  },
  "rejectReason": ""
}`,
              "Rules:",
              `- truck.listingUrl MUST equal exactly: ${suppliedUrl}`,
              "- Evidence fields must quote text from that page only.",
              "- If the page is not a usable individual listing, set truck null and rejectReason.",
              "- contact requires companyName, phone, and sourceUrl — omit contact (null) if any are missing.",
              "- Never invent values.",
            ].join("\n"),
          },
        ],
        inspectBudget
      );

      webSearchCalls += countWebSearchCalls(inspectResponse);
      inputTokens += inspectResponse.usage?.input_tokens ?? 0;
      outputTokens += inspectResponse.usage?.output_tokens ?? 0;
      const inspectRaw = extractOutputText(inspectResponse);
      rawParts.push(`--- stage2 inspect ${suppliedUrl} ---\n` + inspectRaw);

      const inspected = parseInspectPayloadJson(inspectRaw, suppliedUrl);
      if (!inspected.truck) {
        notes.push(
          `Rejected ${suppliedUrl}: ${inspected.rejectReason || "inspect produced no bound truck"}`
        );
        continue;
      }
      trucks.push(inspected.truck);
      if (inspected.contact) contacts.push(inspected.contact);
    }

    // Deduplicate contacts by company|phone (not by array position vs trucks)
    const contactKey = new Set<string>();
    const uniqueContacts: ExtractedContactCandidate[] = [];
    for (const c of contacts) {
      const key = `${c.company.toLowerCase()}|${c.phone}`;
      if (contactKey.has(key)) continue;
      contactKey.add(key);
      uniqueContacts.push(c);
    }

    const payload: SearchModelPayload = {
      trucks,
      contacts: uniqueContacts,
      sourcesConsulted: [...new Set(sourcesConsulted)],
      queriesUsed: [...new Set(queriesUsed)],
      notes: notes.join(" | "),
    };

    return {
      provider: "openai",
      payload,
      usage: {
        provider: "openai",
        model: DEFAULT_MODEL,
        webSearchCalls,
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimateOpenAiSearchCostUsd({
          webSearchCalls,
          inputTokens,
          outputTokens,
        }),
        live: true,
        creditsConsumed: 0,
        searchesRun: webSearchCalls,
        extractsRun: trucks.length,
      },
      rawText: rawParts.join("\n\n"),
      queriesPlanned,
    };
  } catch (e) {
    throw new Error(sanitizeProviderError(e));
  }
}

export const runOpenAiProvider: SearchProviderFn = async (profile) =>
  runOpenAiProviderSearch(profile);
