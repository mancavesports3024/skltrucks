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
} from "@/lib/sourcing/search/openai-normalize";
import {
  discoveryTextFormat,
  inspectTextFormat,
} from "@/lib/sourcing/search/openai-schemas";
import { truncateForLog } from "@/lib/sourcing/search/json-safe";
import {
  ProviderSearchError,
  staffMessageForStage,
} from "@/lib/sourcing/search/provider-error";
import type { SearchProviderFn, SearchProviderResult } from "@/lib/sourcing/search/providers/types";
import type {
  ExtractedContactCandidate,
  ExtractedTruckCandidate,
  SearchApiUsage,
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

export function getOpenAiSearchModel(): string {
  return DEFAULT_MODEL;
}

type ResponsesCreateParams = OpenAI.Responses.ResponseCreateParamsNonStreaming & {
  max_tool_calls?: number;
  text?: ReturnType<typeof discoveryTextFormat> | ReturnType<typeof inspectTextFormat>;
};

/** Minimal client surface for production SDK + unit-test mocks. */
export type OpenAiResponsesClient = {
  responses: {
    create: (params: ResponsesCreateParams) => Promise<OpenAI.Responses.Response>;
  };
};

export function extractOutputText(response: OpenAI.Responses.Response): string {
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

export function countWebSearchCalls(response: OpenAI.Responses.Response): number {
  let n = 0;
  for (const item of response.output ?? []) {
    if (item.type === "web_search_call") {
      const action = (item as { action?: { type?: string } }).action;
      if (!action || action.type === "search") n += 1;
    }
  }
  return n;
}

function addUsage(
  acc: { webSearchCalls: number; inputTokens: number; outputTokens: number },
  response: OpenAI.Responses.Response
) {
  acc.webSearchCalls += countWebSearchCalls(response);
  acc.inputTokens += response.usage?.input_tokens ?? 0;
  acc.outputTokens += response.usage?.output_tokens ?? 0;
}

function buildUsage(
  acc: { webSearchCalls: number; inputTokens: number; outputTokens: number },
  extras?: { formatRetries?: number; extractsRun?: number }
): SearchApiUsage {
  return {
    provider: "openai",
    model: DEFAULT_MODEL,
    webSearchCalls: acc.webSearchCalls,
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    estimatedCostUsd: estimateOpenAiSearchCostUsd(acc),
    live: true,
    creditsConsumed: 0,
    searchesRun: acc.webSearchCalls,
    extractsRun: extras?.extractsRun ?? 0,
    ...(extras?.formatRetries != null ? { formatRetries: extras.formatRetries } : {}),
  };
}

function logParseFailure(stage: string, detail: string, raw: string, listingUrl?: string) {
  const safeDetail = sanitizeProviderError(new Error(detail));
  console.error(
    `[sourcing:openai] ${stage} JSON parse failed` +
      (listingUrl ? ` url=${listingUrl}` : "") +
      ` detail=${safeDetail} raw=${truncateForLog(raw)}`
  );
}

async function createLiveResponse(
  client: OpenAiResponsesClient,
  input: ResponsesCreateParams["input"],
  maxToolCalls: number,
  textFormat: ReturnType<typeof discoveryTextFormat> | ReturnType<typeof inspectTextFormat>
): Promise<OpenAI.Responses.Response> {
  return client.responses.create({
    model: DEFAULT_MODEL,
    tools: [{ type: "web_search" }],
    tool_choice: "auto",
    max_tool_calls: maxToolCalls,
    include: ["web_search_call.action.sources"],
    stream: false,
    text: textFormat,
    input,
  });
}

/**
 * Formatting-only retry: no web_search tools, max_tool_calls 0.
 * Asks for schema-valid JSON without adding/changing facts.
 * Counts toward overall tool budget by requiring remainingBudget > 0
 * only for the *slot* — we use 0 tool calls so we never exceed web_search budget.
 */
async function createFormatRetryResponse(
  client: OpenAiResponsesClient,
  stage: "discovery" | "inspection",
  malformedRaw: string,
  textFormat: ReturnType<typeof discoveryTextFormat> | ReturnType<typeof inspectTextFormat>,
  listingUrl?: string
): Promise<OpenAI.Responses.Response> {
  const truncated = malformedRaw.slice(0, 12_000);
  return client.responses.create({
    model: DEFAULT_MODEL,
    tools: [],
    max_tool_calls: 0,
    stream: false,
    text: textFormat,
    input: [
      {
        role: "system",
        content:
          "You only reformat invalid JSON into valid schema-conforming JSON. " +
          "Do not add, invent, infer, or change any facts, URLs, phones, VINs, prices, or specs. " +
          "If a value is missing or unclear, use empty string / null / empty array as appropriate. " +
          "Return ONLY JSON.",
      },
      {
        role: "user",
        content: [
          `Stage: ${stage}.`,
          listingUrl ? `Listing URL (must stay verbatim if present): ${listingUrl}` : "",
          "Reformat the following into valid JSON matching the response schema. Formatting only.",
          "",
          truncated,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
}

function tryParseDiscovery(raw: string) {
  return parseDiscoveryPayloadJson(raw);
}

function tryParseInspect(raw: string, suppliedUrl: string) {
  return parseInspectPayloadJson(raw, suppliedUrl);
}

/**
 * Two-stage OpenAI web_search pilot with structured outputs + one format retry.
 * Discovery parse failure fails the run; one inspect parse failure does not.
 */
export async function runOpenAiProviderSearch(
  profile: BuyingProfile,
  options?: { client?: OpenAiResponsesClient }
): Promise<SearchProviderResult> {
  if (!options?.client && !isOpenAiSearchConfigured()) {
    throw new Error("OpenAI search is not configured.");
  }

  const queriesPlanned = buildSearchQueriesFromProfile(profile);
  const client: OpenAiResponsesClient =
    options?.client ?? new OpenAI({ apiKey: getOpenAiApiKey() });
  const profileBlock = buyingProfilePromptBlock(profile);
  const budget = Number.isFinite(MAX_TOOL_CALLS) ? Math.max(1, MAX_TOOL_CALLS) : 6;

  const acc = { webSearchCalls: 0, inputTokens: 0, outputTokens: 0 };
  let formatRetries = 0;
  const rawParts: string[] = [];
  const notes: string[] = [];
  const stageErrors: string[] = [];
  const trucks: ExtractedTruckCandidate[] = [];
  const contacts: ExtractedContactCandidate[] = [];
  const sourcesConsulted: string[] = [];
  const queriesUsed: string[] = [];

  const usageSnapshot = (extracts = trucks.length) =>
    buildUsage(acc, { formatRetries, extractsRun: extracts });

  try {
    // --- Stage 1: discovery ---
    const stage1Budget = budget <= 1 ? 1 : Math.min(2, budget - 1);
    const discoveryResponse = await createLiveResponse(
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
            "Return structured JSON with listingUrls (max 4 individual pages), queriesUsed, sourcesConsulted, notes.",
            "Do not return truck specs in this stage — URLs only.",
          ].join("\n"),
        },
      ],
      stage1Budget,
      discoveryTextFormat()
    );

    addUsage(acc, discoveryResponse);
    let discoveryRaw = extractOutputText(discoveryResponse);
    rawParts.push("--- stage1 discovery ---\n" + discoveryRaw);

    let discovery;
    try {
      discovery = tryParseDiscovery(discoveryRaw);
    } catch (parseErr) {
      logParseFailure(
        "discovery",
        parseErr instanceof Error ? parseErr.message : String(parseErr),
        discoveryRaw
      );
      // One formatting-only retry (no web_search; does not consume tool-call budget)
      formatRetries += 1;
      const retryResponse = await createFormatRetryResponse(
        client,
        "discovery",
        discoveryRaw,
        discoveryTextFormat()
      );
      addUsage(acc, retryResponse);
      discoveryRaw = extractOutputText(retryResponse);
      rawParts.push("--- stage1 discovery format-retry ---\n" + discoveryRaw);
      try {
        discovery = tryParseDiscovery(discoveryRaw);
      } catch (retryErr) {
        logParseFailure(
          "discovery-retry",
          retryErr instanceof Error ? retryErr.message : String(retryErr),
          discoveryRaw
        );
        throw new ProviderSearchError({
          provider: "openai",
          live: true,
          stage: "discovery",
          staffMessage: staffMessageForStage("discovery"),
          usage: usageSnapshot(0),
          queriesExecuted: queriesPlanned.slice(0, 1),
          sourcesSearched: [],
          formatRetries,
          cause: retryErr,
        });
      }
    }

    queriesUsed.push(
      ...(discovery.queriesUsed.length ? discovery.queriesUsed : queriesPlanned.slice(0, 1))
    );
    sourcesConsulted.push(...discovery.sourcesConsulted, ...discovery.listingUrls);
    if (discovery.notes) notes.push("discovery: " + discovery.notes);

    const remaining = Math.max(0, budget - acc.webSearchCalls);
    const urlsToInspect = discovery.listingUrls.slice(0, remaining);

    if (urlsToInspect.length === 0) {
      notes.push(
        "Stage 1 returned no usable individual listingUrls; nothing to inspect. Untied sourcesConsulted were not turned into trucks."
      );
    }

    // --- Stage 2: inspect each URL independently ---
    for (const suppliedUrl of urlsToInspect) {
      if (acc.webSearchCalls >= budget) break;
      const inspectBudget = 1;
      let inspectRaw = "";
      try {
        const inspectResponse = await createLiveResponse(
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
                "Return structured JSON with truck (listingUrl must equal the supplied URL), optional contact, or rejectReason.",
                "Rules:",
                `- truck.listingUrl MUST equal exactly: ${suppliedUrl}`,
                "- Evidence fields must quote text from that page only.",
                "- If the page is not a usable individual listing, set truck null and rejectReason.",
                "- contact requires companyName, phone, and sourceUrl — omit contact (null) if any are missing.",
                "- Never invent values.",
              ].join("\n"),
            },
          ],
          inspectBudget,
          inspectTextFormat()
        );

        addUsage(acc, inspectResponse);
        inspectRaw = extractOutputText(inspectResponse);
        rawParts.push(`--- stage2 inspect ${suppliedUrl} ---\n` + inspectRaw);

        let inspected;
        try {
          inspected = tryParseInspect(inspectRaw, suppliedUrl);
        } catch (parseErr) {
          logParseFailure(
            "inspection",
            parseErr instanceof Error ? parseErr.message : String(parseErr),
            inspectRaw,
            suppliedUrl
          );
          formatRetries += 1;
          const retryResponse = await createFormatRetryResponse(
            client,
            "inspection",
            inspectRaw,
            inspectTextFormat(),
            suppliedUrl
          );
          addUsage(acc, retryResponse);
          inspectRaw = extractOutputText(retryResponse);
          rawParts.push(`--- stage2 inspect format-retry ${suppliedUrl} ---\n` + inspectRaw);
          try {
            inspected = tryParseInspect(inspectRaw, suppliedUrl);
          } catch (retryErr) {
            logParseFailure(
              "inspection-retry",
              retryErr instanceof Error ? retryErr.message : String(retryErr),
              inspectRaw,
              suppliedUrl
            );
            const msg = staffMessageForStage("inspection", suppliedUrl);
            stageErrors.push(msg);
            notes.push(`Rejected ${suppliedUrl}: invalid structured data after format retry`);
            continue;
          }
        }

        if (!inspected.truck) {
          notes.push(
            `Rejected ${suppliedUrl}: ${inspected.rejectReason || "inspect produced no bound truck"}`
          );
          continue;
        }
        trucks.push(inspected.truck);
        if (inspected.contact) contacts.push(inspected.contact);
      } catch (e) {
        // Network / SDK errors for one URL should not fail the whole run after discovery
        const msg = sanitizeProviderError(e);
        stageErrors.push(`Inspection failed for ${suppliedUrl}: ${msg}`);
        notes.push(`Rejected ${suppliedUrl}: ${msg}`);
        console.error(
          `[sourcing:openai] inspection provider error url=${suppliedUrl} detail=${msg}`
        );
      }
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
      notes: [...notes, ...stageErrors].filter(Boolean).join(" | "),
    };

    return {
      provider: "openai",
      payload,
      usage: usageSnapshot(trucks.length),
      rawText: rawParts.join("\n\n"),
      queriesPlanned,
      // surface stage errors for the run report without failing the run
      stageErrors,
    };
  } catch (e) {
    if (e instanceof ProviderSearchError) throw e;
    throw new ProviderSearchError({
      provider: "openai",
      live: true,
      stage: "provider",
      staffMessage: sanitizeProviderError(e),
      usage: usageSnapshot(0),
      queriesExecuted: queriesUsed.length ? queriesUsed : queriesPlanned.slice(0, 1),
      sourcesSearched: [...new Set(sourcesConsulted)],
      formatRetries,
      cause: e,
    });
  }
}

export const runOpenAiProvider: SearchProviderFn = async (profile) =>
  runOpenAiProviderSearch(profile);

/**
 * Inspect-only OpenAI path for staff-submitted listing URLs.
 * No discovery stage, no profile-wide web search queries — only the supplied URLs.
 * listingUrl on each result must equal the supplied URL (enforced by parseInspectPayloadJson).
 */
export async function runOpenAiInspectOnlyUrls(
  profile: BuyingProfile,
  listingUrls: string[],
  options?: {
    client?: OpenAiResponsesClient;
    maxToolCalls?: number;
  }
): Promise<SearchProviderResult> {
  if (!options?.client && !isOpenAiSearchConfigured()) {
    throw new Error("OpenAI search is not configured.");
  }

  const urls = listingUrls.filter((u) => Boolean(u?.trim()));
  if (urls.length === 0) {
    throw new Error("No listing URLs to inspect.");
  }

  const client: OpenAiResponsesClient =
    options?.client ?? new OpenAI({ apiKey: getOpenAiApiKey() });
  const profileBlock = buyingProfilePromptBlock(profile);
  const budget = Math.max(
    1,
    Math.min(options?.maxToolCalls ?? urls.length, urls.length)
  );

  const acc = { webSearchCalls: 0, inputTokens: 0, outputTokens: 0 };
  let formatRetries = 0;
  const rawParts: string[] = [];
  const notes: string[] = [
    `Inspect-only mode: ${urls.length} staff-submitted URL(s); no discovery.`,
  ];
  const stageErrors: string[] = [];
  const trucks: ExtractedTruckCandidate[] = [];
  const contacts: ExtractedContactCandidate[] = [];
  const queriesUsed = urls.map((u) => `inspect:${u}`);

  const usageSnapshot = (extracts = trucks.length) =>
    buildUsage(acc, { formatRetries, extractsRun: extracts });

  for (const suppliedUrl of urls) {
    if (acc.webSearchCalls >= budget) {
      stageErrors.push(
        `Skipped remaining URLs: tool budget ${budget} exhausted after ${acc.webSearchCalls} web_search call(s).`
      );
      break;
    }

    const inspectBudget = 1;
    let inspectRaw = "";
    try {
      const inspectResponse = await createLiveResponse(
        client,
        [
          {
            role: "system",
            content:
              "You inspect ONE truck listing page. Return ONLY JSON. Never invent phones, VINs, prices, or specs. GVW is not GVWR. listingUrl MUST be copied verbatim from the supplied URL. Do not discover or follow other URLs.",
          },
          {
            role: "user",
            content: [
              profileBlock,
              "",
              `Inspect this exact listing URL (use web_search / browse as needed for THIS URL ONLY):`,
              suppliedUrl,
              "",
              "Return structured JSON with truck (listingUrl must equal the supplied URL), optional contact, or rejectReason.",
              "Rules:",
              `- truck.listingUrl MUST equal exactly: ${suppliedUrl}`,
              "- Do not return a different listing URL. Do not search for other inventory.",
              "- Evidence fields must quote text from that page only.",
              "- If the page is not a usable individual listing, set truck null and rejectReason.",
              "- contact requires companyName, phone, and sourceUrl — omit contact (null) if any are missing.",
              "- Never invent values.",
            ].join("\n"),
          },
        ],
        inspectBudget,
        inspectTextFormat()
      );

      addUsage(acc, inspectResponse);
      inspectRaw = extractOutputText(inspectResponse);
      rawParts.push(`--- inspect-only ${suppliedUrl} ---\n` + inspectRaw);

      let inspected;
      try {
        inspected = tryParseInspect(inspectRaw, suppliedUrl);
      } catch (parseErr) {
        logParseFailure(
          "inspection",
          parseErr instanceof Error ? parseErr.message : String(parseErr),
          inspectRaw,
          suppliedUrl
        );
        formatRetries += 1;
        const retryResponse = await createFormatRetryResponse(
          client,
          "inspection",
          inspectRaw,
          inspectTextFormat(),
          suppliedUrl
        );
        addUsage(acc, retryResponse);
        inspectRaw = extractOutputText(retryResponse);
        rawParts.push(`--- inspect-only format-retry ${suppliedUrl} ---\n` + inspectRaw);
        try {
          inspected = tryParseInspect(inspectRaw, suppliedUrl);
        } catch (retryErr) {
          logParseFailure(
            "inspection-retry",
            retryErr instanceof Error ? retryErr.message : String(retryErr),
            inspectRaw,
            suppliedUrl
          );
          const msg = staffMessageForStage("inspection", suppliedUrl);
          stageErrors.push(msg);
          notes.push(`Rejected ${suppliedUrl}: invalid structured data after format retry`);
          continue;
        }
      }

      if (!inspected.truck) {
        notes.push(
          `Rejected ${suppliedUrl}: ${inspected.rejectReason || "inspect produced no bound truck"}`
        );
        continue;
      }
      // Defense in depth: never accept a rewritten listing URL
      if (inspected.truck.listingUrl !== suppliedUrl) {
        stageErrors.push(
          `Rejected ${suppliedUrl}: model returned a different listingUrl (no rewrite allowed).`
        );
        continue;
      }
      trucks.push(inspected.truck);
      if (inspected.contact) contacts.push(inspected.contact);
    } catch (e) {
      const msg = sanitizeProviderError(e);
      stageErrors.push(`Inspection failed for ${suppliedUrl}: ${msg}`);
      notes.push(`Rejected ${suppliedUrl}: ${msg}`);
      console.error(
        `[sourcing:openai] inspect-only provider error url=${suppliedUrl} detail=${msg}`
      );
    }
  }

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
    sourcesConsulted: [...urls],
    queriesUsed,
    notes: [...notes, ...stageErrors].filter(Boolean).join(" | "),
  };

  return {
    provider: "openai",
    payload,
    usage: usageSnapshot(trucks.length),
    rawText: rawParts.join("\n\n"),
    queriesPlanned: queriesUsed,
    stageErrors,
  };
}

