export type MatchStatus =
  | "confirmed_match"
  | "needs_verification"
  | "does_not_match"
  | "out_of_range_opportunity";

export type ListedWeightTerm = "gvwr" | "gvw" | "unknown" | "other";

export type LeadWorkflowStatus =
  | "new"
  | "researching"
  | "contacted"
  | "waiting"
  | "passed"
  | "purchased"
  | "closed";

export type ConstraintOutcome = "pass" | "fail" | "unknown";

export interface BuyingProfile {
  id: string;
  requireCummins: boolean;
  requireAutomatic: boolean;
  requiredBoxLengthsFt: number[];
  maxGvwrLbs: number;
  gvwrMustBeStrictlyBelow: boolean;
  maxMileage: number;
  maxAgeYears: number;
  preferLiftgate: boolean;
  preferredMaxDrivingMiles: number;
  maxPrice: number | null;
  originLabel: string;
  notes: string;
  updatedAt?: string;
}

export interface BuyingProfileInput {
  requireCummins: boolean;
  requireAutomatic: boolean;
  requiredBoxLengthsFt: number[];
  maxGvwrLbs: number;
  gvwrMustBeStrictlyBelow: boolean;
  maxMileage: number;
  maxAgeYears: number;
  preferLiftgate: boolean;
  preferredMaxDrivingMiles: number;
  maxPrice: number | null;
  originLabel: string;
  notes: string;
}

export interface MatchReason {
  code: string;
  label: string;
  outcome: ConstraintOutcome | "preferred_pass" | "preferred_fail" | "preferred_unknown" | "info";
  required: boolean;
}

export interface MatchResult {
  status: MatchStatus;
  reasons: MatchReason[];
  earliestAcceptedModelYear: number;
}

export interface TruckLead {
  id: string;
  seller: string;
  supplierContactId: string | null;
  sourceUrl: string;
  sourceListingId: string;
  canonicalListingUrl: string;
  stockNumber: string;
  vin: string;
  year: number | null;
  makeModel: string;
  boxLengthFt: number | null;
  boxLengthRaw: string;
  engine: string;
  engineIsCummins: boolean | null;
  transmission: string;
  transmissionIsAutomatic: boolean | null;
  listedWeightLbs: number | null;
  listedWeightTerm: ListedWeightTerm;
  manufacturerGvwrLbs: number | null;
  gvwrDoorPlateVerified: boolean;
  mileage: number | null;
  hasLiftgate: boolean | null;
  liftgateNotes: string;
  price: number | null;
  location: string;
  drivingDistanceMiles: number | null;
  distanceIsEstimate: boolean;
  dateLastChecked: string | null;
  verificationNotes: string;
  workflowStatus: LeadWorkflowStatus;
  sklCallNotes: string;
  researchUncertaintyLabels: string[];
  isSeedResearch: boolean;
  seedSource: string;
  matchStatus: MatchStatus;
  matchReasons: MatchReason[];
  createdAt?: string;
  updatedAt?: string;
}

export type TruckLeadInput = Omit<
  TruckLead,
  "id" | "matchStatus" | "matchReasons" | "createdAt" | "updatedAt"
>;

export interface SupplierContact {
  id: string;
  company: string;
  contactName: string;
  role: string;
  phone: string;
  email: string;
  sourceUrl: string;
  supplierType: string;
  dealerWholesaleStatus: string;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  callNotes: string;
  drivingDistanceMiles: number | null;
  phoneVerified: boolean;
  researchNotes: string;
  createdAt?: string;
  updatedAt?: string;
}

export type SupplierContactInput = Omit<SupplierContact, "id" | "createdAt" | "updatedAt">;

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  confirmed_match: "Confirmed match",
  needs_verification: "Needs verification",
  does_not_match: "Does not match",
  out_of_range_opportunity: "Out-of-range opportunity",
};

export const DEFAULT_BUYING_PROFILE: BuyingProfile = {
  id: "default",
  requireCummins: true,
  requireAutomatic: true,
  requiredBoxLengthsFt: [24, 26, 28],
  maxGvwrLbs: 26000,
  gvwrMustBeStrictlyBelow: true,
  maxMileage: 275000,
  maxAgeYears: 9,
  preferLiftgate: true,
  preferredMaxDrivingMiles: 1200,
  maxPrice: null,
  originLabel: "Joplin, Missouri",
  notes:
    "Manufacturer-rated GVWR must be confirmed from the door plate. A listing field labeled GVW is not proof of GVWR.",
};
