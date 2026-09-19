import "server-only";

import OpenAI from "openai";
import type { BuyingProfile } from "@/types/sourcing";
import {
  buyingProfilePromptBlock,
  buildSearchQueriesFromProfile,
} from "@/lib/sourcing/search/queries";
import type { SearchProviderFn, SearchProviderResult } from "@/lib/sourcing/search/providers/types";
import type { SearchModelPayload } from "@/lib/sourcing/search/types";
import {
  estimateOpenAiSearchCostUsd,
  sanitizeProviderError,
} from "@/lib/sourcing/search/types";

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

export function parseSearchPayloadJson(raw: string): SearchModelPayload {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
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

/**
 * Optional OpenAI Responses + web_search provider (kept for later / fallback).
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
  const maxToolCalls = Number.isFinite(MAX_TOOL_CALLS) ? MAX_TOOL_CALLS : 6;

  try {
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
            "Return JSON with trucks[], contacts[], sourcesConsulted[], queriesUsed[], notes.",
            "Never invent phones, VINs, prices, or specs. GVW is not GVWR.",
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
      provider: "openai",
      payload: {
        ...payload,
        queriesUsed: payload.queriesUsed.length ? payload.queriesUsed : queriesPlanned,
      },
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
        extractsRun: 0,
      },
      rawText,
      queriesPlanned,
    };
  } catch (e) {
    throw new Error(sanitizeProviderError(e));
  }
}

export const runOpenAiProvider: SearchProviderFn = async (profile) =>
  runOpenAiProviderSearch(profile);
