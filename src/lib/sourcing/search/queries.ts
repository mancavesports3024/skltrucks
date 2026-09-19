import type { BuyingProfile } from "@/types/sourcing";
import { earliestAcceptedModelYear } from "@/lib/sourcing/match";

/**
 * Build web-search queries from the active buying profile (never hard-coded alone).
 */
export function buildSearchQueriesFromProfile(
  profile: BuyingProfile,
  asOf: Date = new Date()
): string[] {
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

  const truckCore = [
    `box truck for sale ${engine} ${trans} ${boxes} foot ${gvwr} ${miles} ${lift}`
      .replace(/\s+/g, " ")
      .trim(),
    `Freightliner M2 box truck for sale ${engine} ${trans} ${boxes}' ${gvwr} since ${earliest}`
      .replace(/\s+/g, " ")
      .trim(),
    `used commercial box truck fleet remarketing ${engine} ${boxes} ft ${near}`
      .replace(/\s+/g, " ")
      .trim(),
    `Penske OR Ryder OR Enterprise used box truck ${boxes} foot ${engine} ${trans} for sale`
      .replace(/\s+/g, " ")
      .trim(),
  ];

  const contactCore = [
    `used box truck dealer sales phone near ${near}`,
    `fleet remarketing used truck sales contact phone ${engine} box truck`
      .replace(/\s+/g, " ")
      .trim(),
  ];

  return [...truckCore, ...contactCore];
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
