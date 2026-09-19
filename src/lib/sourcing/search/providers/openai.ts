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
  const trimmed = String(raw ?? "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model did not return JSON object.");
  }
  const parsed = JSON.parse(jsonText.slice(start, end + 1)) as Record<string, unknown>;
  const rawTrucks = Array.isArray(parsed.trucks) ? parsed.trucks : [];
  const rawContacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];

  const asRecord = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : {};

  const pickStr = (obj: Record<string, unknown>, ...keys: string[]): string => {
    for (const k of keys) {
      const v = obj[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return "";
  };

  const pickNum = (obj: Record<string, unknown>, ...keys: string[]): number | null => {
    for (const k of keys) {
      const v = obj[k];
      if (v == null || v === "") continue;
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  const pickBool = (obj: Record<string, unknown>, ...keys: string[]): boolean | null => {
    for (const k of keys) {
      const v = obj[k];
      if (v === true || v === false) return v;
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (s === "true" || s === "yes") return true;
        if (s === "false" || s === "no") return false;
      }
    }
    return null;
  };

  const trucks = rawTrucks.map((item) => {
    const t = asRecord(item);
    const listingUrl = pickStr(t, "listingUrl", "listing_url", "url", "sourceUrl", "source_url");
    return {
      listingUrl,
      sourceName: pickStr(t, "sourceName", "source_name", "source"),
      seller: pickStr(t, "seller", "dealer", "company"),
      stockNumber: pickStr(t, "stockNumber", "stock_number", "stock"),
      vin: pickStr(t, "vin", "VIN"),
      year: pickNum(t, "year"),
      makeModel: pickStr(t, "makeModel", "make_model", "model", "make"),
      engine: pickStr(t, "engine"),
      engineIsCummins: pickBool(t, "engineIsCummins", "engine_is_cummins"),
      engineEvidence: pickStr(t, "engineEvidence", "engine_evidence"),
      transmission: pickStr(t, "transmission"),
      transmissionIsAutomatic: pickBool(
        t,
        "transmissionIsAutomatic",
        "transmission_is_automatic"
      ),
      transmissionEvidence: pickStr(t, "transmissionEvidence", "transmission_evidence"),
      boxLengthFt: pickNum(t, "boxLengthFt", "box_length_ft", "boxLength"),
      boxLengthEvidence: pickStr(t, "boxLengthEvidence", "box_length_evidence"),
      manufacturerGvwrLbs: pickNum(
        t,
        "manufacturerGvwrLbs",
        "manufacturer_gvwr_lbs",
        "gvwr"
      ),
      listedWeightLbs: pickNum(t, "listedWeightLbs", "listed_weight_lbs"),
      listedWeightTerm: (pickStr(t, "listedWeightTerm", "listed_weight_term") ||
        "unknown") as "gvwr" | "gvw" | "unknown",
      gvwrEvidence: pickStr(t, "gvwrEvidence", "gvwr_evidence"),
      mileage: pickNum(t, "mileage", "miles"),
      hasLiftgate: pickBool(t, "hasLiftgate", "has_liftgate", "liftgate"),
      askingPrice: pickNum(t, "askingPrice", "asking_price", "price"),
      auctionCurrentBid: pickNum(t, "auctionCurrentBid", "auction_current_bid"),
      location: pickStr(t, "location"),
      drivingDistanceMiles: pickNum(t, "drivingDistanceMiles", "driving_distance_miles"),
      distanceIsEstimate: pickBool(t, "distanceIsEstimate", "distance_is_estimate") !== false,
      phone: pickStr(t, "phone", "telephone", "tel"),
      contactName: pickStr(t, "contactName", "contact_name"),
      contactRole: pickStr(t, "contactRole", "contact_role", "role"),
      evidenceUrl: pickStr(t, "evidenceUrl", "evidence_url") || listingUrl,
      notes: pickStr(t, "notes"),
    };
  });

  const contacts = rawContacts.map((item) => {
    const c = asRecord(item);
    return {
      company: pickStr(c, "company", "seller", "dealer"),
      contactName: pickStr(c, "contactName", "contact_name", "name"),
      role: pickStr(c, "role", "contactRole", "contact_role"),
      phone: pickStr(c, "phone", "telephone", "tel"),
      email: pickStr(c, "email"),
      sourceUrl: pickStr(c, "sourceUrl", "source_url", "url"),
      supplierType: pickStr(c, "supplierType", "supplier_type"),
      evidenceQuote: pickStr(c, "evidenceQuote", "evidence_quote"),
      notes: pickStr(c, "notes"),
    };
  });

  return {
    trucks,
    contacts,
    sourcesConsulted: Array.isArray(parsed.sourcesConsulted)
      ? parsed.sourcesConsulted.map(String)
      : Array.isArray(parsed.sources_consulted)
        ? (parsed.sources_consulted as unknown[]).map(String)
        : [],
    queriesUsed: Array.isArray(parsed.queriesUsed)
      ? parsed.queriesUsed.map(String)
      : Array.isArray(parsed.queries_used)
        ? (parsed.queries_used as unknown[]).map(String)
        : [],
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
