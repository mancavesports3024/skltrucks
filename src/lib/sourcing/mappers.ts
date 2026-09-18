import type {
  BuyingProfile,
  BuyingProfileInput,
  ListedWeightTerm,
  MatchReason,
  MatchStatus,
  LeadWorkflowStatus,
  SpecEvidence,
  SupplierContact,
  SupplierContactInput,
  TruckLead,
  TruckLeadInput,
} from "@/types/sourcing";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";
import { normalizeSpecEvidence } from "@/lib/sourcing/intake/sources";

export interface DbBuyingProfile {
  id: string;
  require_cummins: boolean;
  require_automatic: boolean;
  required_box_lengths_ft: number[] | null;
  max_gvwr_lbs: number;
  gvwr_must_be_strictly_below: boolean;
  max_mileage: number;
  max_age_years: number;
  prefer_liftgate: boolean;
  preferred_max_driving_miles: number;
  max_price: number | null;
  origin_label: string;
  notes: string;
  updated_at?: string;
}

export interface DbTruckLead {
  id: string;
  seller: string | null;
  supplier_contact_id: string | null;
  source_url: string | null;
  source_scope: string | null;
  source_listing_id: string | null;
  canonical_listing_url: string | null;
  stock_number: string | null;
  vin: string | null;
  year: number | null;
  make_model: string | null;
  box_length_ft: number | null;
  box_length_raw: string | null;
  engine: string | null;
  engine_is_cummins: boolean | null;
  transmission: string | null;
  transmission_is_automatic: boolean | null;
  listed_weight_lbs: number | null;
  listed_weight_term: ListedWeightTerm | null;
  manufacturer_gvwr_lbs: number | null;
  gvwr_door_plate_verified: boolean | null;
  mileage: number | null;
  has_liftgate: boolean | null;
  liftgate_notes: string | null;
  price: number | null;
  location: string | null;
  driving_distance_miles: number | null;
  distance_is_estimate: boolean | null;
  date_last_checked: string | null;
  verification_notes: string | null;
  workflow_status: LeadWorkflowStatus | null;
  skl_call_notes: string | null;
  research_uncertainty_labels: string[] | null;
  is_seed_research: boolean | null;
  seed_source: string | null;
  match_status: MatchStatus | null;
  match_reasons: MatchReason[] | null;
  spec_evidence?: SpecEvidence | Record<string, unknown> | null;
  listing_first_seen_at?: string | null;
  listing_last_changed_at?: string | null;
  listing_last_seen_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DbSupplierContact {
  id: string;
  company: string;
  contact_name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  source_url: string | null;
  supplier_type: string | null;
  dealer_wholesale_status: string | null;
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  call_notes: string | null;
  driving_distance_miles: number | null;
  phone_verified: boolean | null;
  research_notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export function rowToBuyingProfile(row: DbBuyingProfile): BuyingProfile {
  return {
    id: row.id,
    requireCummins: row.require_cummins,
    requireAutomatic: row.require_automatic,
    requiredBoxLengthsFt: row.required_box_lengths_ft?.length
      ? [...row.required_box_lengths_ft]
      : [...DEFAULT_BUYING_PROFILE.requiredBoxLengthsFt],
    maxGvwrLbs: row.max_gvwr_lbs,
    gvwrMustBeStrictlyBelow: row.gvwr_must_be_strictly_below,
    maxMileage: row.max_mileage,
    maxAgeYears: row.max_age_years,
    preferLiftgate: row.prefer_liftgate,
    preferredMaxDrivingMiles: row.preferred_max_driving_miles,
    maxPrice: row.max_price == null ? null : Number(row.max_price),
    originLabel: row.origin_label || DEFAULT_BUYING_PROFILE.originLabel,
    notes: row.notes ?? "",
    updatedAt: row.updated_at,
  };
}

export function buyingProfileToRow(input: BuyingProfileInput) {
  return {
    require_cummins: input.requireCummins,
    require_automatic: input.requireAutomatic,
    required_box_lengths_ft: input.requiredBoxLengthsFt,
    max_gvwr_lbs: input.maxGvwrLbs,
    gvwr_must_be_strictly_below: input.gvwrMustBeStrictlyBelow,
    max_mileage: input.maxMileage,
    max_age_years: input.maxAgeYears,
    prefer_liftgate: input.preferLiftgate,
    preferred_max_driving_miles: input.preferredMaxDrivingMiles,
    max_price: input.maxPrice,
    origin_label: input.originLabel,
    notes: input.notes,
  };
}

export function rowToTruckLead(row: DbTruckLead): TruckLead {
  return {
    id: row.id,
    seller: row.seller ?? "",
    supplierContactId: row.supplier_contact_id,
    sourceUrl: row.source_url ?? "",
    sourceScope: row.source_scope ?? "",
    sourceListingId: row.source_listing_id ?? "",
    canonicalListingUrl: row.canonical_listing_url ?? "",
    stockNumber: row.stock_number ?? "",
    vin: row.vin ?? "",
    year: row.year,
    makeModel: row.make_model ?? "",
    boxLengthFt: row.box_length_ft == null ? null : Number(row.box_length_ft),
    boxLengthRaw: row.box_length_raw ?? "",
    engine: row.engine ?? "",
    engineIsCummins: row.engine_is_cummins,
    transmission: row.transmission ?? "",
    transmissionIsAutomatic: row.transmission_is_automatic,
    listedWeightLbs: row.listed_weight_lbs,
    listedWeightTerm: row.listed_weight_term ?? "unknown",
    manufacturerGvwrLbs: row.manufacturer_gvwr_lbs,
    gvwrDoorPlateVerified: Boolean(row.gvwr_door_plate_verified),
    mileage: row.mileage,
    hasLiftgate: row.has_liftgate,
    liftgateNotes: row.liftgate_notes ?? "",
    price: row.price == null ? null : Number(row.price),
    location: row.location ?? "",
    drivingDistanceMiles:
      row.driving_distance_miles == null ? null : Number(row.driving_distance_miles),
    distanceIsEstimate: Boolean(row.distance_is_estimate),
    dateLastChecked: row.date_last_checked,
    verificationNotes: row.verification_notes ?? "",
    workflowStatus: row.workflow_status ?? "new",
    sklCallNotes: row.skl_call_notes ?? "",
    researchUncertaintyLabels: row.research_uncertainty_labels ?? [],
    isSeedResearch: Boolean(row.is_seed_research),
    seedSource: row.seed_source ?? "",
    matchStatus: row.match_status ?? "needs_verification",
    matchReasons: Array.isArray(row.match_reasons) ? row.match_reasons : [],
    specEvidence: normalizeSpecEvidence(row.spec_evidence),
    listingFirstSeenAt: row.listing_first_seen_at ?? row.created_at,
    listingLastChangedAt: row.listing_last_changed_at ?? row.updated_at,
    listingLastSeenAt:
      row.listing_last_seen_at ?? row.listing_first_seen_at ?? row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function truckLeadInputToRow(
  input: TruckLeadInput & {
    matchStatus: MatchStatus;
    matchReasons: MatchReason[];
    listingLastChangedAt?: string | null;
    listingFirstSeenAt?: string | null;
    listingLastSeenAt?: string | null;
  }
) {
  const row: Record<string, unknown> = {
    seller: input.seller.trim(),
    supplier_contact_id: input.supplierContactId || null,
    source_url: input.sourceUrl.trim(),
    source_scope: input.sourceScope.trim(),
    source_listing_id: input.sourceListingId.trim(),
    canonical_listing_url: input.canonicalListingUrl.trim(),
    stock_number: input.stockNumber.trim(),
    vin: input.vin.trim().toUpperCase(),
    year: input.year,
    make_model: input.makeModel.trim(),
    box_length_ft: input.boxLengthFt,
    box_length_raw: input.boxLengthRaw.trim(),
    engine: input.engine.trim(),
    engine_is_cummins: input.engineIsCummins,
    transmission: input.transmission.trim(),
    transmission_is_automatic: input.transmissionIsAutomatic,
    listed_weight_lbs: input.listedWeightLbs,
    listed_weight_term: input.listedWeightTerm,
    manufacturer_gvwr_lbs: input.manufacturerGvwrLbs,
    gvwr_door_plate_verified: input.gvwrDoorPlateVerified,
    mileage: input.mileage,
    has_liftgate: input.hasLiftgate,
    liftgate_notes: input.liftgateNotes.trim(),
    price: input.price,
    location: input.location.trim(),
    driving_distance_miles: input.drivingDistanceMiles,
    distance_is_estimate: input.distanceIsEstimate,
    date_last_checked: input.dateLastChecked || null,
    verification_notes: input.verificationNotes.trim(),
    workflow_status: input.workflowStatus,
    skl_call_notes: input.sklCallNotes.trim(),
    research_uncertainty_labels: input.researchUncertaintyLabels,
    is_seed_research: input.isSeedResearch,
    seed_source: input.seedSource.trim(),
    match_status: input.matchStatus,
    match_reasons: input.matchReasons,
    spec_evidence: normalizeSpecEvidence(input.specEvidence),
  };

  if (input.listingLastChangedAt) {
    row.listing_last_changed_at = input.listingLastChangedAt;
  }
  if (input.listingFirstSeenAt) {
    row.listing_first_seen_at = input.listingFirstSeenAt;
  }
  if (input.listingLastSeenAt) {
    row.listing_last_seen_at = input.listingLastSeenAt;
  }

  return row;
}

export function rowToSupplierContact(row: DbSupplierContact): SupplierContact {
  return {
    id: row.id,
    company: row.company,
    contactName: row.contact_name ?? "",
    role: row.role ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    sourceUrl: row.source_url ?? "",
    supplierType: row.supplier_type ?? "",
    dealerWholesaleStatus: row.dealer_wholesale_status ?? "",
    lastContactDate: row.last_contact_date,
    nextFollowUpDate: row.next_follow_up_date,
    callNotes: row.call_notes ?? "",
    drivingDistanceMiles:
      row.driving_distance_miles == null ? null : Number(row.driving_distance_miles),
    phoneVerified: Boolean(row.phone_verified),
    researchNotes: row.research_notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function supplierContactInputToRow(input: SupplierContactInput) {
  return {
    company: input.company.trim(),
    contact_name: input.contactName.trim(),
    role: input.role.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    source_url: input.sourceUrl.trim(),
    supplier_type: input.supplierType.trim(),
    dealer_wholesale_status: input.dealerWholesaleStatus.trim(),
    last_contact_date: input.lastContactDate || null,
    next_follow_up_date: input.nextFollowUpDate || null,
    call_notes: input.callNotes.trim(),
    driving_distance_miles: input.drivingDistanceMiles,
    phone_verified: input.phoneVerified,
    research_notes: input.researchNotes.trim(),
  };
}
