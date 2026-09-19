/**
 * Pure OpenAI payload normalization / validation (no network, no server-only).
 * Never associates sourcesConsulted[i] with trucks[i] by array position.
 */
import { isIndividualListingUrl } from "@/lib/sourcing/search/map-candidates";
import type {
  ExtractedContactCandidate,
  ExtractedTruckCandidate,
  SearchModelPayload,
} from "@/lib/sourcing/search/types";

export interface DiscoveryPayload {
  listingUrls: string[];
  queriesUsed: string[];
  sourcesConsulted: string[];
  notes: string;
}

export interface InspectPayload {
  truck: ExtractedTruckCandidate | null;
  contact: ExtractedContactCandidate | null;
  rejectReason: string;
}

export interface NormalizedSearchResult {
  payload: SearchModelPayload;
  rejectedTrucks: Array<{ reason: string; raw?: unknown }>;
  rejectedContacts: Array<{ reason: string; raw?: unknown }>;
  /** Sources that could not be unambiguously tied to a truck.listingUrl */
  untiedSources: string[];
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function pickNum(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickBool(obj: Record<string, unknown>, ...keys: string[]): boolean | null {
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
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = String(raw ?? "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model did not return JSON object.");
  }
  return JSON.parse(jsonText.slice(start, end + 1)) as Record<string, unknown>;
}

export function mapRawTruck(item: unknown): ExtractedTruckCandidate {
  const t = asRecord(item);
  const listingUrl = pickStr(t, "listingUrl", "listing_url", "url", "sourceUrl", "source_url");
  return {
    listingUrl,
    sourceName: pickStr(t, "sourceName", "source_name", "source"),
    seller: pickStr(t, "seller", "dealer", "company", "companyName", "company_name"),
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
    manufacturerGvwrLbs: pickNum(t, "manufacturerGvwrLbs", "manufacturer_gvwr_lbs", "gvwr"),
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
}

export function mapRawContact(item: unknown): ExtractedContactCandidate {
  const c = asRecord(item);
  const company = pickStr(c, "companyName", "company_name", "company", "seller", "dealer");
  return {
    company,
    contactName: pickStr(c, "contactName", "contact_name", "name"),
    role: pickStr(c, "role", "contactRole", "contact_role"),
    phone: pickStr(c, "phone", "telephone", "tel"),
    email: pickStr(c, "email"),
    sourceUrl: pickStr(c, "sourceUrl", "source_url", "url"),
    supplierType: pickStr(c, "supplierType", "supplier_type"),
    evidenceQuote: pickStr(c, "evidenceQuote", "evidence_quote"),
    notes: pickStr(c, "notes"),
  };
}

export function truckRejectReason(truck: ExtractedTruckCandidate): string | null {
  if (!truck.listingUrl) return "Missing listingUrl — must be copied verbatim from the page.";
  if (!isIndividualListingUrl(truck.listingUrl)) {
    return "listingUrl is not an individual vehicle page.";
  }
  return null;
}

export function contactRejectReason(contact: ExtractedContactCandidate): string | null {
  if (!contact.company) {
    return "Missing companyName/company — required on every contact.";
  }
  if (!contact.phone) {
    return "Missing phone — required on every contact.";
  }
  if (!contact.sourceUrl) {
    return "Missing sourceUrl — required on every contact.";
  }
  return null;
}

/**
 * Normalize a combined model payload. Never assigns sourcesConsulted[i] → trucks[i].
 * Untied sources (in sourcesConsulted but not equal to any accepted truck.listingUrl)
 * are reported separately for rejection — not turned into trucks by guesswork.
 */
export function normalizeSearchPayload(
  parsed: Record<string, unknown>,
  options?: { requireTruckListingUrl?: boolean }
): NormalizedSearchResult {
  const requireTruckListingUrl = options?.requireTruckListingUrl !== false;
  const rawTrucks = Array.isArray(parsed.trucks) ? parsed.trucks : [];
  const rawContacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];
  const sourcesConsulted = Array.isArray(parsed.sourcesConsulted)
    ? parsed.sourcesConsulted.map(String)
    : Array.isArray(parsed.sources_consulted)
      ? (parsed.sources_consulted as unknown[]).map(String)
      : [];
  const queriesUsed = Array.isArray(parsed.queriesUsed)
    ? parsed.queriesUsed.map(String)
    : Array.isArray(parsed.queries_used)
      ? (parsed.queries_used as unknown[]).map(String)
      : [];

  const trucks: ExtractedTruckCandidate[] = [];
  const rejectedTrucks: NormalizedSearchResult["rejectedTrucks"] = [];
  const contacts: ExtractedContactCandidate[] = [];
  const rejectedContacts: NormalizedSearchResult["rejectedContacts"] = [];

  for (const raw of rawTrucks) {
    const truck = mapRawTruck(raw);
    const reason = requireTruckListingUrl ? truckRejectReason(truck) : null;
    if (reason) {
      rejectedTrucks.push({ reason, raw });
      continue;
    }
    trucks.push(truck);
  }

  for (const raw of rawContacts) {
    const contact = mapRawContact(raw);
    const reason = contactRejectReason(contact);
    if (reason) {
      rejectedContacts.push({ reason, raw });
      continue;
    }
    contacts.push(contact);
  }

  const acceptedUrls = new Set(trucks.map((t) => t.listingUrl));
  const untiedSources = sourcesConsulted.filter((url) => {
    const trimmed = String(url || "").trim();
    if (!trimmed) return false;
    // Exact match only — never fuzzy / position-based association
    return !acceptedUrls.has(trimmed);
  });

  for (const url of untiedSources) {
    rejectedTrucks.push({
      reason:
        "Source URL in sourcesConsulted could not be unambiguously tied to a truck.listingUrl (no position-based or guessed association).",
      raw: { listingUrl: url },
    });
  }

  return {
    payload: {
      trucks,
      contacts,
      sourcesConsulted,
      queriesUsed,
      notes: String(parsed.notes ?? ""),
    },
    rejectedTrucks,
    rejectedContacts,
    untiedSources,
  };
}

export function parseSearchPayloadJson(raw: string): SearchModelPayload {
  const normalized = normalizeSearchPayload(parseJsonObject(raw));
  return normalized.payload;
}

export function parseDiscoveryPayloadJson(raw: string): DiscoveryPayload {
  const parsed = parseJsonObject(raw);
  const fromListingUrls = Array.isArray(parsed.listingUrls)
    ? parsed.listingUrls.map(String)
    : Array.isArray(parsed.listing_urls)
      ? (parsed.listing_urls as unknown[]).map(String)
      : [];
  const fromSources = Array.isArray(parsed.sourcesConsulted)
    ? parsed.sourcesConsulted.map(String)
    : Array.isArray(parsed.sources_consulted)
      ? (parsed.sources_consulted as unknown[]).map(String)
      : [];

  // Prefer explicit listingUrls; also accept sourcesConsulted only when they
  // individually pass the individual-listing URL gate — still no truck zip.
  const candidates = [...fromListingUrls, ...fromSources];
  const seen = new Set<string>();
  const listingUrls: string[] = [];
  for (const url of candidates) {
    const trimmed = String(url || "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (!isIndividualListingUrl(trimmed)) continue;
    seen.add(trimmed);
    listingUrls.push(trimmed);
  }

  return {
    listingUrls,
    queriesUsed: Array.isArray(parsed.queriesUsed)
      ? parsed.queriesUsed.map(String)
      : Array.isArray(parsed.queries_used)
        ? (parsed.queries_used as unknown[]).map(String)
        : [],
    sourcesConsulted: fromSources,
    notes: String(parsed.notes ?? ""),
  };
}

/**
 * Stage-2 inspect result: listingUrl on the truck MUST equal suppliedUrl exactly.
 */
export function parseInspectPayloadJson(
  raw: string,
  suppliedUrl: string
): InspectPayload {
  const parsed = parseJsonObject(raw);
  const rejectReason = pickStr(parsed, "rejectReason", "reject_reason");

  if (parsed.truck == null && rejectReason) {
    return { truck: null, contact: null, rejectReason };
  }

  const truckRaw = parsed.truck ?? parsed;
  const truck = mapRawTruck(truckRaw);

  if (!truck.listingUrl) {
    return {
      truck: null,
      contact: null,
      rejectReason: "Inspect result missing listingUrl.",
    };
  }
  if (truck.listingUrl !== suppliedUrl) {
    return {
      truck: null,
      contact: null,
      rejectReason: `Inspect listingUrl must equal supplied URL verbatim (got mismatch; no rewrite).`,
    };
  }
  const urlReason = truckRejectReason(truck);
  if (urlReason) {
    return { truck: null, contact: null, rejectReason: urlReason };
  }

  let contact: ExtractedContactCandidate | null = null;
  if (parsed.contact != null) {
    const mapped = mapRawContact(parsed.contact);
    const cReason = contactRejectReason(mapped);
    if (!cReason) contact = mapped;
  }

  return { truck, contact, rejectReason: "" };
}
