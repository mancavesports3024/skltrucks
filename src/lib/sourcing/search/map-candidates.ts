import {
  buildSourceListingId,
  buildSourceScope,
  canonicalizeListingUrl,
  normalizeVin,
} from "@/lib/sourcing/duplicates";
import { applyEvidenceGate } from "@/lib/sourcing/intake/csv";
import { emptySpecEvidence } from "@/lib/sourcing/intake/sources";
import type { ExtractedTruckCandidate } from "@/lib/sourcing/search/types";
import { emptySpecEvidenceFromCandidate } from "@/lib/sourcing/search/types";
import type { SupplierContactInput, TruckLeadInput } from "@/types/sourcing";

const CATEGORY_PATH_HINTS = [
  "/search",
  "/search-inventory",
  "/inventory/",
  "/category/",
  "/listings",
  "/results",
];

/** Reject category/search pages that are not individual vehicle URLs. */
export function isIndividualListingUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (!/^https?:$/i.test(parsed.protocol)) return false;
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  // Bare inventory roots / search paths without a specific unit slug
  if (path === "/" || path === "/inventory" || path === "/search-inventory") return false;
  if (/\/search(-inventory)?\/?$/i.test(path)) return false;
  // Allow /inventory/used-...-vin-or-stock style
  if (/\/inventory\/?$/i.test(path)) return false;
  // Heuristic: must have a path segment that looks like a unit page
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) {
    // single segment like /PU-1001 might be ok
    return segments.length === 1 && segments[0].length > 4;
  }
  void CATEGORY_PATH_HINTS;
  return true;
}

export function candidateToTruckLeadInput(
  t: ExtractedTruckCandidate
): { input: TruckLeadInput; rejectReason?: string } {
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

  const seller = (t.seller || t.sourceName || "").trim();
  const sourceUrl = t.listingUrl.trim();
  const sourceScope = buildSourceScope({
    seller,
    sourceUrl,
    sourceScope: t.sourceName,
  });
  const stockNumber = (t.stockNumber || "").trim();
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
    engineIsCummins: gated.engineIsCummins,
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
    location: (t.location || "").trim(),
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
    seedSource: "Internet Search Pilot (OpenAI web_search)",
    specEvidence: { ...emptySpecEvidence(), ...evidence },
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
  const phone = (c.phone || "").trim();
  const company = (c.company || "").trim();
  if (!company) {
    return { input: {} as SupplierContactInput, rejectReason: "Missing company name." };
  }
  if (!phone) {
    return {
      input: {} as SupplierContactInput,
      rejectReason: "No publicly verified phone number.",
    };
  }

  const input: SupplierContactInput = {
    company,
    contactName: (c.contactName || "").trim(),
    role: (c.role || "").trim(),
    phone,
    email: (c.email || "").trim(),
    sourceUrl: (c.sourceUrl || "").trim(),
    supplierType: (c.supplierType || "").trim() || "Web search",
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
