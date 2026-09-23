import type { LeadComparisonSnapshot } from "@/lib/sourcing/market-comparison/types";

const REQUIRED: Array<{ key: keyof LeadComparisonSnapshot; label: string }> = [
  { key: "year", label: "Year" },
  { key: "makeModel", label: "Make/model" },
  { key: "mileage", label: "Mileage" },
  { key: "price", label: "Asking/wholesale price" },
];

const PREFERRED: Array<{ key: keyof LeadComparisonSnapshot; label: string }> = [
  { key: "boxLengthFt", label: "Box length" },
  { key: "engine", label: "Engine" },
  { key: "transmission", label: "Transmission" },
  { key: "manufacturerGvwrLbs", label: "GVWR" },
  { key: "hasLiftgate", label: "Liftgate" },
  { key: "location", label: "Location" },
];

function isPresent(lead: LeadComparisonSnapshot, key: keyof LeadComparisonSnapshot): boolean {
  const v = lead[key];
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  return false;
}

export function missingRequiredLeadFields(lead: LeadComparisonSnapshot): string[] {
  return REQUIRED.filter((f) => !isPresent(lead, f.key)).map((f) => f.label);
}

export function missingPreferredLeadFields(lead: LeadComparisonSnapshot): string[] {
  const missing: string[] = [];
  for (const f of PREFERRED) {
    if (f.key === "manufacturerGvwrLbs") {
      if (lead.manufacturerGvwrLbs == null && lead.listedWeightLbs == null) {
        missing.push(f.label);
      }
      continue;
    }
    if (f.key === "engine") {
      if (!lead.engine?.trim() && lead.engineIsCummins == null) missing.push(f.label);
      continue;
    }
    if (f.key === "transmission") {
      if (!lead.transmission?.trim() && lead.transmissionIsAutomatic == null) {
        missing.push(f.label);
      }
      continue;
    }
    if (!isPresent(lead, f.key)) missing.push(f.label);
  }
  return missing;
}

export function isLeadEligibleForMarketComparison(lead: LeadComparisonSnapshot): boolean {
  return missingRequiredLeadFields(lead).length === 0;
}

export function leadToComparisonSnapshot(lead: {
  id: string;
  year: number | null;
  makeModel: string;
  mileage: number | null;
  price: number | null;
  boxLengthFt: number | null;
  engine: string;
  engineIsCummins: boolean | null;
  transmission: string;
  transmissionIsAutomatic: boolean | null;
  manufacturerGvwrLbs: number | null;
  listedWeightLbs?: number | null;
  hasLiftgate: boolean | null;
  location: string;
}): LeadComparisonSnapshot {
  return {
    id: lead.id,
    year: lead.year,
    makeModel: lead.makeModel,
    mileage: lead.mileage,
    price: lead.price,
    boxLengthFt: lead.boxLengthFt,
    engine: lead.engine,
    engineIsCummins: lead.engineIsCummins,
    transmission: lead.transmission,
    transmissionIsAutomatic: lead.transmissionIsAutomatic,
    manufacturerGvwrLbs: lead.manufacturerGvwrLbs,
    listedWeightLbs: lead.listedWeightLbs ?? null,
    hasLiftgate: lead.hasLiftgate,
    location: lead.location,
  };
}
