import type { BuyingProfile } from "@/types/sourcing";
import { earliestAcceptedModelYear } from "@/lib/sourcing/match";

/** Commercial truck marketplaces / fleet remarketers used for scoped discovery. */
export const TRUCK_SALE_DOMAINS = [
  "penskeusedtrucks.com",
  "usedtrucks.ryder.com",
  "trucksales.enterprise.com",
  "commercialtrucktrader.com",
  "truckpaper.com",
  "mylittlesalesman.com",
  "debarytrucksales.com",
] as const;

export interface SearchQueryPlan {
  query: string;
  /** When set, Tavily `includeDomains` scopes the request. */
  includeDomains?: string[];
  purpose: "truck_discovery" | "contact_discovery";
}

/**
 * Build web-search queries from the active buying profile (never hard-coded alone).
 */
export function buildSearchQueriesFromProfile(
  profile: BuyingProfile,
  asOf: Date = new Date()
): string[] {
  return buildSearchQueryPlans(profile, asOf).map((p) => p.query);
}

/**
 * Profile + domain combination plans for multi-source discovery.
 * Kept small so a Tavily basic run stays well under the credit budget.
 */
export function buildSearchQueryPlans(
  profile: BuyingProfile,
  asOf: Date = new Date()
): SearchQueryPlan[] {
  const earliest = earliestAcceptedModelYear(profile, asOf);
  const boxes = profile.requiredBoxLengthsFt.join(" OR ");
  const engine = profile.requireCummins ? "Cummins" : "diesel";
  const trans = profile.requireAutomatic ? "automatic" : "";
  const gvwr = profile.gvwrMustBeStrictlyBelow
    ? `GVWR under ${profile.maxGvwrLbs}`
    : `GVWR ${profile.maxGvwrLbs}`;
  const miles = `under ${profile.maxMileage.toLocaleString()} miles`;
  const near = profile.originLabel || "Joplin, Missouri";
  const lift = profile.preferLiftgate ? "liftgate" : "";

  const core = `${engine} ${trans} ${boxes} foot box truck for sale ${gvwr} ${miles} ${lift}`
    .replace(/\s+/g, " ")
    .trim();

  const plans: SearchQueryPlan[] = [
    {
      purpose: "truck_discovery",
      query: core,
    },
    {
      purpose: "truck_discovery",
      query: `Freightliner M2 box truck ${engine} ${trans} ${boxes}' ${gvwr} since ${earliest}`
        .replace(/\s+/g, " ")
        .trim(),
    },
    {
      purpose: "truck_discovery",
      query: `used fleet remarketing box truck ${engine} ${boxes} ft ${near}`
        .replace(/\s+/g, " ")
        .trim(),
      includeDomains: ["penskeusedtrucks.com", "usedtrucks.ryder.com", "trucksales.enterprise.com"],
    },
    {
      purpose: "truck_discovery",
      query: `${engine} automatic ${boxes} ft box truck for sale GVWR`
        .replace(/\s+/g, " ")
        .trim(),
      includeDomains: ["commercialtrucktrader.com", "truckpaper.com", "mylittlesalesman.com"],
    },
    {
      purpose: "truck_discovery",
      query: `26 foot ${engine} ${trans} box truck for sale ${gvwr}`
        .replace(/\s+/g, " ")
        .trim(),
      includeDomains: ["debarytrucksales.com"],
    },
    {
      purpose: "contact_discovery",
      query: `used box truck dealer sales phone near ${near}`,
    },
    {
      purpose: "contact_discovery",
      query: `fleet remarketing used truck sales contact phone ${engine} box truck`
        .replace(/\s+/g, " ")
        .trim(),
    },
  ];

  return plans;
}

export function buyingProfilePromptBlock(profile: BuyingProfile, asOf: Date = new Date()): string {
  const earliest = earliestAcceptedModelYear(profile, asOf);
  return [
    "Active SKL buying profile (from database — follow exactly):",
    `- Cummins engine required: ${profile.requireCummins}`,
    `- Automatic transmission required: ${profile.requireAutomatic}`,
    `- Box length required (exact feet): ${profile.requiredBoxLengthsFt.join(", ")}`,
    `- Manufacturer-rated GVWR: ${profile.gvwrMustBeStrictlyBelow ? "strictly below" : "≤"} ${profile.maxGvwrLbs} lbs`,
    `- Max mileage: ${profile.maxMileage}`,
    `- Earliest model year: ${earliest} (max age ${profile.maxAgeYears} years)`,
    `- Liftgate preferred: ${profile.preferLiftgate}`,
    `- Preferred max driving miles from ${profile.originLabel}: ${profile.preferredMaxDrivingMiles}`,
    `- Max price: ${profile.maxPrice == null ? "none (not filtered)" : profile.maxPrice}`,
    "",
    "Rules:",
    "- Only include CURRENT individual vehicle listing URLs (not category/search pages).",
    "- Never invent phone numbers, contacts, specs, VINs, stock numbers, or availability.",
    "- Never infer Cummins/automatic/box length/manufacturer GVWR from the model name alone.",
    '- A field labeled \"GVW\" is NOT proof of manufacturer-rated GVWR.',
    "- For every extracted required spec, include evidence_url or evidence_quote from the page.",
    "- If a required spec lacks evidence, set it null/unknown — do not guess.",
    "- Prefer published business phones on dealer/fleet pages connected to the listing.",
    "- Estimate driving distance from Joplin, Missouri only as an estimate; mark distance_is_estimate true.",
    "- Distinguish asking_price vs auction_current_bid; never mix them.",
  ].join("\n");
}
