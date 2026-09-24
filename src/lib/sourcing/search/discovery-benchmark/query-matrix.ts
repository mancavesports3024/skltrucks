/**
 * Deterministic discovery query matrix for SKL internet truck-listing search.
 * Discovery queries stay broad: find plausible unit URLs.
 * GVWR, mileage, liftgate, and distance are inspection/classification fields —
 * they are intentionally NOT forced into every discovery query.
 */
import { TRUCK_SALE_DOMAINS } from "@/lib/sourcing/search/queries";
import type { BuyingProfile } from "@/types/sourcing";

export type DiscoveryQueryPurpose = "make_model" | "box_spec" | "powertrain" | "regional" | "domain_targeted";

export type DiscoveryQueryPlan = {
  id: string;
  query: string;
  purpose: DiscoveryQueryPurpose;
  /** Optional Tavily includeDomains scope. */
  includeDomains?: string[];
};

/**
 * States reasonably within ~1,200 mi of Joplin, MO for regional variants.
 * Not every state is placed into every query.
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

export const DEFAULT_DISCOVERY_QUERY_CEILING = 12;

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function boxLengths(profile: BuyingProfile): number[] {
  const lengths = profile.requiredBoxLengthsFt.filter((n) => Number.isFinite(n) && n > 0);
  return lengths.length > 0 ? lengths : [24, 26, 28];
}

/**
 * Build ~10–15 smaller discovery queries from the saved buying profile.
 * Does not require every qualification field in each query.
 */
export function buildDiscoveryQueryMatrix(
  profile: BuyingProfile,
  options?: { maxQueries?: number; includeDomainTargeted?: boolean }
): DiscoveryQueryPlan[] {
  const maxQueries = Math.max(1, Math.min(30, options?.maxQueries ?? DEFAULT_DISCOVERY_QUERY_CEILING));
  const includeDomain = options?.includeDomainTargeted !== false;
  const boxes = boxLengths(profile);
  const engine = profile.requireCummins ? "Cummins" : "diesel";
  const trans = profile.requireAutomatic ? "automatic" : "";
  const plans: DiscoveryQueryPlan[] = [];

  const push = (id: string, purpose: DiscoveryQueryPurpose, query: string, includeDomains?: string[]) => {
    if (plans.length >= maxQueries) return;
    plans.push({
      id,
      purpose,
      query: normalizeSpaces(query),
      ...(includeDomains?.length ? { includeDomains } : {}),
    });
  };

  // Make / model family queries (high-yield discovery)
  push("mm-freightliner-m2-106", "make_model", "Freightliner M2 106 box truck for sale");
  push("mm-international-mv", "make_model", "International MV box truck for sale");
  push("mm-kenworth-t270", "make_model", "Kenworth T270 box truck for sale");

  // Box-length × powertrain (one query per required length)
  for (const ft of boxes.slice(0, 3)) {
    push(
      `box-${ft}ft-cummins-auto`,
      "box_spec",
      `${ft} foot box truck ${engine} ${trans} for sale`
    );
  }

  // Powertrain / CDL-adjacent phrasing (still discovery — not GVWR/mileage dumps)
  push("pt-cummins-allison", "powertrain", "Cummins Allison box truck for sale");
  push("pt-under-cdl-cummins", "powertrain", `under CDL box truck ${engine} for sale`);
  push(
    "pt-medium-duty-cummins-auto",
    "powertrain",
    `medium duty box truck ${engine} ${trans} for sale`
  );

  // Optional domain-targeted queries using known dealer/marketplace domains already in-repo
  // Placed before regional so the default 12-query ceiling still includes them.
  if (includeDomain) {
    push(
      "dom-fleet-remarketers",
      "domain_targeted",
      `${engine} box truck for sale`,
      ["penskeusedtrucks.com", "usedtrucks.ryder.com", "trucksales.enterprise.com"]
    );
    push(
      "dom-marketplaces",
      "domain_targeted",
      `${engine} ${trans} box truck for sale`,
      ["commercialtrucktrader.com", "truckpaper.com", "mylittlesalesman.com"]
    );
  }

  // Regional variants — rotate a few states; do not embed all states in every query
  const regionalStates = [
    JOINT_RADIUS_STATES[0], // Missouri
    JOINT_RADIUS_STATES[1], // Kansas
    JOINT_RADIUS_STATES[4], // Texas
  ];
  for (const state of regionalStates) {
    if (plans.length >= maxQueries) break;
    push(
      `reg-${state.toLowerCase().slice(0, 6)}-box`,
      "regional",
      `${engine} ${trans} box truck for sale ${state}`.replace(/\s+/g, " ")
    );
  }

  if (includeDomain && plans.length < maxQueries) {
    push(
      "dom-regional-dealer",
      "domain_targeted",
      `${boxes[1] ?? 26} foot ${engine} box truck for sale`,
      ["debarytrucksales.com"]
    );
  }

  return plans.slice(0, maxQueries);
}

/** Assert matrix does not force inspection-only fields into every discovery query. */
export function discoveryQueriesAreRelaxed(plans: DiscoveryQueryPlan[]): boolean {
  const inspectionOnly = [/gvwr/i, /26,?000/i, /275,?000/i, /liftgate/i, /1,?200/i];
  // At least half of queries must omit these forced inspection terms
  let relaxed = 0;
  for (const p of plans) {
    if (!inspectionOnly.some((re) => re.test(p.query))) relaxed += 1;
  }
  return relaxed >= Math.ceil(plans.length / 2);
}

export function listKnownDiscoveryDomains(): readonly string[] {
  return TRUCK_SALE_DOMAINS;
}
