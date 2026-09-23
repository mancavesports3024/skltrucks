import {
  buildSourceListingId,
  buildSourceScope,
  canonicalizeListingUrl,
  normalizeVin,
} from "@/lib/sourcing/duplicates";
import { applyEvidenceGate } from "@/lib/sourcing/intake/csv";
import { emptySpecEvidence } from "@/lib/sourcing/intake/sources";
import {
  UNITED_STATES,
  resolveLeadCountry,
} from "@/lib/sourcing/location/country";
import { applyDeterministicEngineIsCummins } from "@/lib/sourcing/search/deterministic-specs";
import type { ExtractedTruckCandidate } from "@/lib/sourcing/search/types";
import { emptySpecEvidenceFromCandidate } from "@/lib/sourcing/search/types";
import type { SupplierContactInput, TruckLeadInput } from "@/types/sourcing";

const BLOCKED_HOST_SUFFIXES = [
  "youtube.com",
  "youtu.be",
  "reddit.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "c-span.org",
  "wikipedia.org",
  "automattic.com",
];

const CATEGORY_PATH_RE =
  /\/(search|search-inventory|results|category|categories|listings|for-sale|trucks-for-sale|shop|used)\/?$/i;

/** Hosts that are never individual commercial truck listing pages. */
export function isBlockedListingHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return BLOCKED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

/** Reject category/search pages that are not individual vehicle URLs. */
export function isIndividualListingUrl(url: string): boolean {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (!/^https?:$/i.test(parsed.protocol)) return false;
  if (isBlockedListingHost(parsed.hostname)) return false;

  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/inventory" || path === "/search-inventory") return false;
  if (CATEGORY_PATH_RE.test(path)) return false;
  if (/\/inventory\/?$/i.test(path)) return false;
  // Marketplace search pages with query params but no unit slug
  if (/\/(search|listings)\b/i.test(path) && !/\/(listing|inventory|detail|unit|stock|vdp)\b/i.test(path)) {
    // allow /inventory/used-2019-... below; block /search? and /listings?
    if (!/\/inventory\/.+/i.test(path)) return false;
  }
  // Craigslist area search, Autotrader SRP, CarGurus shop hubs
  if (/craigslist\.org$/i.test(parsed.hostname) && /\/search\b/i.test(path)) return false;
  if (/autotrader\.com$/i.test(parsed.hostname) && /\/cars-for-sale\b/i.test(path)) return false;
  if (/cargurus\.com$/i.test(parsed.hostname) && /\/shop\b/i.test(path)) return false;
  if (/commercialtrucktrader\.com$/i.test(parsed.hostname) && /trucks-for-sale/i.test(path)) {
    // dealer hub or category search — need a numeric listing id segment to accept later
    if (!/\/\d{6,}\b/.test(path)) return false;
  }
  if (/truckpaper\.com$/i.test(parsed.hostname) && /\/listings\b/i.test(path)) return false;

  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) {
    return segments.length === 1 && segments[0].length > 4;
  }

  // Prefer paths that look like a specific unit (inventory slug, listing id, detail)
  const last = segments[segments.length - 1] || "";
  const looksLikeUnit =
    /used-|for-sale|inventory|listing|detail|vdp|stock|unit|\d{5,}/i.test(path) ||
    /[a-z]{2,}-\d{2,}/i.test(last) ||
    /^\d{6,}$/.test(last);
  return looksLikeUnit;
}

export function candidateToTruckLeadInput(
  t: ExtractedTruckCandidate
): { input: TruckLeadInput; rejectReason?: string } {
  if (!t?.listingUrl || !String(t.listingUrl).trim()) {
    return {
      input: {} as TruckLeadInput,
      rejectReason: "Missing individual listing URL.",
    };
  }
  if (!isIndividualListingUrl(t.listingUrl)) {
    return {
      input: {} as TruckLeadInput,
      rejectReason: "Not an individual listing URL (category/search page).",
    };
  }

  const evidence = emptySpecEvidenceFromCandidate(t);
  const gated = applyEvidenceGate({
    engineIsCummins: t.engineIsCummins,
    transmissionIsAutomatic: t.transmissionIsAutomatic,
    boxLengthFt: t.boxLengthFt,
    manufacturerGvwrLbs: t.manufacturerGvwrLbs,
    listedWeightLbs: t.listedWeightLbs,
    listedWeightTerm: t.listedWeightTerm || "unknown",
    gvwrDoorPlateVerified: false,
    evidence,
  });

  // Deterministic reject only: known non-Cummins engine text forces fail even when
  // OpenAI left engineIsCummins null/true. Do not invent Cummins=true without evidence.
  const inferred = applyDeterministicEngineIsCummins({
    engine: t.engine,
    engineEvidence: t.engineEvidence || evidence.engine,
    engineIsCummins: gated.engineIsCummins,
  });
  const deterministicEngine =
    inferred === false ? false : gated.engineIsCummins;

  const seller = String(t.seller || t.sourceName || "").trim();
  const sourceUrl = String(t.listingUrl).trim();
  const sourceScope = buildSourceScope({
    seller,
    sourceUrl,
    sourceScope: t.sourceName,
  });
  const stockNumber = String(t.stockNumber || "").trim();
  const sourceListingId = buildSourceListingId({
    sourceListingId: stockNumber,
    stockNumber,
  });

  if (!sourceScope || !sourceListingId) {
    // Fall back to URL path slug as listing id
    let slug = "";
    try {
      const parts = new URL(sourceUrl).pathname.split("/").filter(Boolean);
      slug = parts[parts.length - 1] || "";
    } catch {
      slug = "";
    }
    if (!slug) {
      return { input: {} as TruckLeadInput, rejectReason: "Missing source scope / listing id." };
    }
  }

  const finalListingId =
    sourceListingId ||
    (() => {
      try {
        const parts = new URL(sourceUrl).pathname.split("/").filter(Boolean);
        return parts[parts.length - 1] || "listing";
      } catch {
        return "listing";
      }
    })();

  const price =
    t.askingPrice != null
      ? t.askingPrice
      : t.auctionCurrentBid != null
        ? t.auctionCurrentBid
        : null;

  const notes: string[] = [];
  if (t.notes) notes.push(t.notes);
  if (t.askingPrice != null) notes.push(`Asking price: $${t.askingPrice}`);
  if (t.auctionCurrentBid != null) {
    notes.push(`Auction current bid (not asking price): $${t.auctionCurrentBid}`);
  }
  if (t.phone) notes.push(`Published listing/seller phone: ${t.phone}`);
  if (t.contactName) notes.push(`Named contact: ${t.contactName}${t.contactRole ? ` (${t.contactRole})` : ""}`);
  if (gated.missingEvidence.length) {
    notes.push(
      `Missing evidence for: ${gated.missingEvidence.join(", ")} — Needs verification.`
    );
  }
  if (t.evidenceUrl) notes.push(`Evidence URL: ${t.evidenceUrl}`);

  const location = (t.location || "").trim();
  const countryResolution = resolveLeadCountry({ location });
  const countryEvidence =
    countryResolution.kind === "us"
      ? UNITED_STATES
      : countryResolution.kind === "foreign"
        ? countryResolution.country
        : undefined;
  if (countryResolution.kind === "foreign") {
    notes.push(`Outside allowed country: ${countryResolution.country}`);
  }

  const input: TruckLeadInput = {
    seller: seller || sourceScope,
    supplierContactId: null,
    sourceUrl,
    sourceScope: sourceScope || buildSourceScope({ seller: seller || "web-search", sourceUrl }),
    sourceListingId: finalListingId,
    canonicalListingUrl: canonicalizeListingUrl(sourceUrl),
    stockNumber: stockNumber || finalListingId,
    vin: normalizeVin(t.vin || ""),
    year: t.year,
    makeModel: (t.makeModel || "").trim(),
    boxLengthFt: gated.boxLengthFt,
    boxLengthRaw: t.boxLengthFt != null ? `${t.boxLengthFt}'` : "",
    engine: (t.engine || "").trim(),
    engineIsCummins: deterministicEngine,
    transmission: (t.transmission || "").trim(),
    transmissionIsAutomatic: gated.transmissionIsAutomatic,
    listedWeightLbs: gated.listedWeightLbs,
    listedWeightTerm: gated.listedWeightTerm,
    manufacturerGvwrLbs: gated.manufacturerGvwrLbs,
    gvwrDoorPlateVerified: gated.gvwrDoorPlateVerified,
    mileage: t.mileage,
    hasLiftgate: t.hasLiftgate,
    liftgateNotes: "",
    price,
    location,
    drivingDistanceMiles: t.drivingDistanceMiles,
    distanceIsEstimate: t.distanceIsEstimate !== false,
    dateLastChecked: new Date().toISOString().slice(0, 10),
    verificationNotes: notes.join("\n"),
    workflowStatus: "new",
    sklCallNotes: "",
    researchUncertaintyLabels: [
      "internet_search_pilot",
      ...gated.uncertaintyLabels,
    ],
    isSeedResearch: false,
    seedSource: "Internet Search Pilot",
    specEvidence: {
      ...emptySpecEvidence(),
      ...evidence,
      ...(countryEvidence ? { country: countryEvidence } : {}),
    },
  };

  return { input };
}

export function candidateToContactInput(
  c: {
    company: string;
    contactName: string;
    role: string;
    phone: string;
    email: string;
    sourceUrl: string;
    supplierType: string;
    evidenceQuote: string;
    notes: string;
  }
): { input: SupplierContactInput; rejectReason?: string } {
  const phone = String(c.phone || "").trim();
  const company = String(c.company || "").trim();
  if (!company) {
    return { input: {} as SupplierContactInput, rejectReason: "Missing company name." };
  }
  if (!phone) {
    return {
      input: {} as SupplierContactInput,
      rejectReason: "No publicly verified phone number.",
    };
  }
  const sourceUrl = String(c.sourceUrl || "").trim();
  if (!sourceUrl) {
    return {
      input: {} as SupplierContactInput,
      rejectReason: "Missing sourceUrl — required on every contact.",
    };
  }

  const input: SupplierContactInput = {
    company,
    contactName: String(c.contactName || "").trim(),
    role: String(c.role || "").trim(),
    phone,
    email: String(c.email || "").trim(),
    sourceUrl,
    supplierType: String(c.supplierType || "").trim() || "Web search",
    dealerWholesaleStatus: "",
    lastContactDate: null,
    nextFollowUpDate: null,
    callNotes: "",
    drivingDistanceMiles: null,
    phoneVerified: true,
    researchNotes: [c.evidenceQuote, c.notes, "Source: Internet Search Pilot"]
      .filter(Boolean)
      .join("\n"),
  };
  return { input };
}
