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

/** Evidence snippets tied to required buying-profile specs. */
export interface SpecEvidence {
  engine?: string;
  transmission?: string;
  boxLength?: string;
  gvwr?: string;
  /**
   * HTTPS third-party inspection report URL from an authorized workbook.
   * Not a public sale/listing URL — stored in jsonb evidence only (no migration).
   */
  inspectionUrl?: string;
  /**
   * Provenance for a hyperlink taken from a Penske Unit Number cell.
   * Stored in jsonb — no migration.
   */
  hyperlinkSource?: "workbook_unit_cell" | "";
  /** listing | inspection | rejected | missing (or empty when N/A) */
  hyperlinkDestinationType?: string;
  hyperlinkHostname?: string;
  /** Staff-safe validation summary (never stores raw unsafe URLs). */
  hyperlinkValidation?: string;
  /** Dealer workbook status / completion text (e.g. Not Started, 75% COMPLETE). */
  workbookStatus?: string;
  salesTerms?: string;
  penskeStatus?: string;
  titleStatus?: string;
  /**
   * Offline estimated straight-line distance provenance (Census gazetteer + haversine).
   * Never describes driving distance. Stored in jsonb — no migration.
   */
  distance?: string;
  /**
   * Resolved country label when known (United States / Canada / …).
   * Stored in jsonb — no migration. Used for US-only classification audit.
   */
  country?: string;
}

export interface TruckLead {
  id: string;
  seller: string;
  supplierContactId: string | null;
  sourceUrl: string;
  sourceScope: string;
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
  /** Evidence text for Cummins / automatic / box / manufacturer GVWR. */
  specEvidence: SpecEvidence;
  /** When the listing was first discovered — not bumped by staff edits. */
  listingFirstSeenAt?: string;
  /** When listing-significant fields last changed — not bumped by notes/match-only edits. */
  listingLastChangedAt?: string;
  /** Last time intake observed this listing (re-seen without change still bumps this). */
  listingLastSeenAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type TruckLeadInput = Omit<
  TruckLead,
  | "id"
  | "matchStatus"
  | "matchReasons"
  | "listingFirstSeenAt"
  | "listingLastChangedAt"
  | "listingLastSeenAt"
  | "createdAt"
  | "updatedAt"
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
  /** Accept GVWR ≤ 26,000 lb; reject only when ≥ 26,001 lb. */
  gvwrMustBeStrictlyBelow: false,
  maxMileage: 275000,
  maxAgeYears: 9,
  preferLiftgate: true,
  preferredMaxDrivingMiles: 1200,
  maxPrice: null,
  originLabel: "Joplin, Missouri",
  notes:
    "Maximum manufacturer-rated GVWR is 26,000 lb (≤ 26,000 accepted; ≥ 26,001 rejected). Confirm from the door plate when possible. A listing field labeled GVW is not proof of GVWR unless taken from an authorized dealer workbook with retained evidence.",
};
