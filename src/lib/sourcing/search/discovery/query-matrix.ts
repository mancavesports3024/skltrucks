/**
 * Deterministic discovery query matrix for SKL internet truck-listing search.
 *
 * Discovery stays relaxed on inspection fields (GVWR, mileage, liftgate, distance)
 * but is oriented toward unit-level pages (VIN / Stock # / unit terminology)
 * after live run 1 retained almost only category hubs.
 */
/**
 * Shared unit-oriented discovery query matrix (production Preview + benchmark).
 */
import { earliestAcceptedModelYear } from "@/lib/sourcing/match";
import { DISCOVERY_MAX_QUERIES } from "@/lib/sourcing/search/discovery/ceilings";
import { TRUCK_SALE_DOMAINS } from "@/lib/sourcing/search/queries";
import type { BuyingProfile } from "@/types/sourcing";

export type DiscoveryQueryPurpose =
  | "make_model"
  | "box_spec"
  | "powertrain"
  | "year_model"
  | "domain_targeted";

export type DiscoveryQueryPlan = {
  id: string;
  query: string;
  purpose: DiscoveryQueryPurpose;
  /** Optional Tavily includeDomains scope. */
  includeDomains?: string[];
};

/**
 * States reasonably within ~1,200 mi of Joplin, MO (reference set for future regional variants).
 * Not every state is placed into every query; run-2 matrix prioritizes unit/VIN/stock terms.
 */
export const JOINT_RADIUS_STATES = [
  "Missouri",
  "Kansas",
  "Oklahoma",
  "Arkansas",
  "Texas",
  "Illinois",
  "Iowa",
  "Nebraska",
  "Tennessee",
  "Kentucky",
  "Indiana",
  "Mississippi",
  "Louisiana",
] as const;

export const DEFAULT_DISCOVERY_QUERY_CEILING = DISCOVERY_MAX_QUERIES;

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function boxLengths(profile: BuyingProfile): number[] {
  const lengths = profile.requiredBoxLengthsFt.filter((n) => Number.isFinite(n) && n > 0);
  return lengths.length > 0 ? lengths : [24, 26, 28];
}

/**
 * Build ≤12 unit-oriented discovery queries from the saved buying profile.
 * Does not force GVWR/mileage/liftgate/distance into every query.
 */
export function buildDiscoveryQueryMatrix(
  profile: BuyingProfile,
  options?: { maxQueries?: number; includeDomainTargeted?: boolean; asOf?: Date }
): DiscoveryQueryPlan[] {
  const maxQueries = Math.max(1, Math.min(30, options?.maxQueries ?? DEFAULT_DISCOVERY_QUERY_CEILING));
  const includeDomain = options?.includeDomainTargeted !== false;
  const boxes = boxLengths(profile);
  const midBox = boxes[1] ?? boxes[0] ?? 26;
  const engine = profile.requireCummins ? "Cummins" : "diesel";
  const earliest = earliestAcceptedModelYear(profile, options?.asOf ?? new Date());
  const plans: DiscoveryQueryPlan[] = [];

  const push = (
    id: string,
    purpose: DiscoveryQueryPurpose,
    query: string,
    includeDomains?: string[]
  ) => {
    if (plans.length >= maxQueries) return;
    plans.push({
      id,
      purpose,
      query: normalizeSpaces(query),
      ...(includeDomains?.length ? { includeDomains } : {}),
    });
  };

  // Make/model + unit identifiers (favor VDPs over category SEO)
  push(
    "mm-fl-vin",
    "make_model",
    `"Freightliner M2 106" "VIN" "box truck" for sale`
  );
  push(
    "mm-fl-stock",
    "make_model",
    `"Freightliner M2 106" "Stock #" "box truck"`
  );
  push(
    "mm-intl-vin",
    "make_model",
    `"International MV" "VIN" "${midBox} ft box"`
  );
  push(
    "mm-kw-stock",
    "make_model",
    `"Kenworth T270" "Stock #" "box truck"`
  );

  // Box + stock / VIN phrasing
  push(
    "box-26-stock",
    "box_spec",
    `"26 foot box truck" "stock number" ${engine}`
  );
  push(
    "box-24-vin",
    "box_spec",
    `"24 foot box truck" VIN ${engine} automatic`
  );
  push(
    "box-28-stock",
    "box_spec",
    `"28 foot box truck" "Stock #" ${engine}`
  );

  // Powertrain + VIN (not bare "for sale" category bait)
  push(
    "pt-cummins-allison-vin",
    "powertrain",
    `"Cummins" "Allison" "VIN" "box truck"`
  );

  // Eligible year range + make/model
  push(
    "year-fl-vin",
    "year_model",
    `${earliest} Freightliner M2 106 box truck VIN`
  );
  push(
    "year-intl-stock",
    "year_model",
    `${earliest} International MV box truck "stock"`
  );

  // Domain-targeted with VDP terminology (avoid eBay / SOARR / bare marketplace browse)
  if (includeDomain) {
    push(
      "dom-penske-unit",
      "domain_targeted",
      `${engine} box truck unit VIN`,
      ["penskeusedtrucks.com", "usedtrucks.ryder.com"]
    );
    push(
      "dom-dealer-stock",
      "domain_targeted",
      `"Stock #" ${engine} "${midBox} foot" box truck`,
      ["debarytrucksales.com", "mylittlesalesman.com"]
    );
  }

  return plans.slice(0, maxQueries);
}

/** Assert matrix does not force inspection-only fields into every discovery query. */
export function discoveryQueriesAreRelaxed(plans: DiscoveryQueryPlan[]): boolean {
  const inspectionOnly = [/gvwr/i, /26,?000/i, /275,?000/i, /liftgate/i, /1,?200/i];
  let relaxed = 0;
  for (const p of plans) {
    if (!inspectionOnly.some((re) => re.test(p.query))) relaxed += 1;
  }
  return relaxed >= Math.ceil(plans.length / 2);
}

/** True when the matrix emphasizes unit-page signals (VIN/stock/unit) over bare category bait. */
export function discoveryQueriesPreferUnitPages(plans: DiscoveryQueryPlan[]): boolean {
  const unitSignal = [/\bVIN\b/i, /stock\s*#/i, /stock number/i, /\bunit\b/i, /\bstock\b/i];
  let withSignal = 0;
  for (const p of plans) {
    if (unitSignal.some((re) => re.test(p.query))) withSignal += 1;
  }
  return withSignal >= Math.ceil(plans.length * 0.6);
}

export function listKnownDiscoveryDomains(): readonly string[] {
  return TRUCK_SALE_DOMAINS;
}
