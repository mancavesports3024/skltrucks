import {
  buildSourceListingId,
  buildSourceScope,
  canonicalizeListingUrl,
  normalizeVin,
} from "@/lib/sourcing/duplicates";
import type {
  BuyingProfileInput,
  ListedWeightTerm,
  LeadWorkflowStatus,
  SupplierContactInput,
  TruckLeadInput,
} from "@/types/sourcing";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalNumber(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function optionalInt(formData: FormData, key: string): number | null {
  const n = optionalNumber(formData, key);
  if (n == null) return null;
  return Math.round(n);
}

function optionalBool(formData: FormData, key: string): boolean | null {
  const raw = str(formData, key);
  if (!raw || raw === "unknown") return null;
  if (raw === "yes" || raw === "true" || raw === "on") return true;
  if (raw === "no" || raw === "false") return false;
  return null;
}

function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

export function parseBuyingProfileForm(formData: FormData): BuyingProfileInput {
  const boxRaw = str(formData, "requiredBoxLengthsFt");
  const requiredBoxLengthsFt = boxRaw
    .split(/[,\s]+/)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const maxPriceRaw = str(formData, "maxPrice");
  const maxPrice =
    maxPriceRaw === "" ? null : Number(maxPriceRaw.replace(/,/g, "").replace(/^\$/, ""));

  return {
    requireCummins: checkbox(formData, "requireCummins"),
    requireAutomatic: checkbox(formData, "requireAutomatic"),
    requiredBoxLengthsFt: requiredBoxLengthsFt.length ? requiredBoxLengthsFt : [24, 26, 28],
    maxGvwrLbs: optionalInt(formData, "maxGvwrLbs") ?? 26000,
    gvwrMustBeStrictlyBelow: checkbox(formData, "gvwrMustBeStrictlyBelow"),
    maxMileage: optionalInt(formData, "maxMileage") ?? 275000,
    maxAgeYears: optionalInt(formData, "maxAgeYears") ?? 9,
    preferLiftgate: checkbox(formData, "preferLiftgate"),
    preferredMaxDrivingMiles: optionalInt(formData, "preferredMaxDrivingMiles") ?? 1200,
    maxPrice: maxPrice != null && Number.isFinite(maxPrice) ? maxPrice : null,
    originLabel: str(formData, "originLabel") || "Joplin, Missouri",
    notes: str(formData, "notes"),
  };
}

export function parseTruckLeadForm(formData: FormData): TruckLeadInput {
  const seller = str(formData, "seller");
  const stockNumber = str(formData, "stockNumber");
  const sourceUrl = str(formData, "sourceUrl");
  const sourceScope = buildSourceScope({
    seller,
    sourceUrl,
    sourceScope: str(formData, "sourceScope"),
  });
  const sourceListingId = buildSourceListingId({
    sourceListingId: str(formData, "sourceListingId"),
    stockNumber,
  });
  const canonicalListingUrl = canonicalizeListingUrl(
    str(formData, "canonicalListingUrl") || sourceUrl
  );

  const listedWeightTerm = (str(formData, "listedWeightTerm") || "unknown") as ListedWeightTerm;
  const workflowStatus = (str(formData, "workflowStatus") || "new") as LeadWorkflowStatus;

  const uncertaintyRaw = str(formData, "researchUncertaintyLabels");
  const researchUncertaintyLabels = uncertaintyRaw
    ? uncertaintyRaw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return {
    seller,
    supplierContactId: str(formData, "supplierContactId") || null,
    sourceUrl,
    sourceScope,
    sourceListingId,
    canonicalListingUrl,
    stockNumber,
    vin: normalizeVin(str(formData, "vin")),
    year: optionalInt(formData, "year"),
    makeModel: str(formData, "makeModel"),
    boxLengthFt: optionalNumber(formData, "boxLengthFt"),
    boxLengthRaw: str(formData, "boxLengthRaw"),
    engine: str(formData, "engine"),
    engineIsCummins: optionalBool(formData, "engineIsCummins"),
    transmission: str(formData, "transmission"),
    transmissionIsAutomatic: optionalBool(formData, "transmissionIsAutomatic"),
    listedWeightLbs: optionalInt(formData, "listedWeightLbs"),
    listedWeightTerm,
    manufacturerGvwrLbs: optionalInt(formData, "manufacturerGvwrLbs"),
    gvwrDoorPlateVerified: checkbox(formData, "gvwrDoorPlateVerified"),
    mileage: optionalInt(formData, "mileage"),
    hasLiftgate: optionalBool(formData, "hasLiftgate"),
    liftgateNotes: str(formData, "liftgateNotes"),
    price: optionalNumber(formData, "price"),
    location: str(formData, "location"),
    drivingDistanceMiles: optionalNumber(formData, "drivingDistanceMiles"),
    distanceIsEstimate: checkbox(formData, "distanceIsEstimate"),
    dateLastChecked: str(formData, "dateLastChecked") || null,
    verificationNotes: str(formData, "verificationNotes"),
    workflowStatus,
    sklCallNotes: str(formData, "sklCallNotes"),
    researchUncertaintyLabels,
    isSeedResearch: checkbox(formData, "isSeedResearch"),
    seedSource: str(formData, "seedSource"),
  };
}

export function parseSupplierContactForm(formData: FormData): SupplierContactInput {
  return {
    company: str(formData, "company"),
    contactName: str(formData, "contactName"),
    role: str(formData, "role"),
    phone: str(formData, "phone"),
    email: str(formData, "email"),
    sourceUrl: str(formData, "sourceUrl"),
    supplierType: str(formData, "supplierType"),
    dealerWholesaleStatus: str(formData, "dealerWholesaleStatus"),
    lastContactDate: str(formData, "lastContactDate") || null,
    nextFollowUpDate: str(formData, "nextFollowUpDate") || null,
    callNotes: str(formData, "callNotes"),
    drivingDistanceMiles: optionalNumber(formData, "drivingDistanceMiles"),
    phoneVerified: checkbox(formData, "phoneVerified"),
    researchNotes: str(formData, "researchNotes"),
  };
}

/** Append a dated call note block to existing notes. */
export function appendCallNote(existing: string, note: string, when: Date = new Date()): string {
  const trimmed = note.trim();
  if (!trimmed) return existing;
  const stamp = when.toISOString().slice(0, 10);
  const block = `[${stamp}] ${trimmed}`;
  return existing.trim() ? `${existing.trim()}\n\n${block}` : block;
}
