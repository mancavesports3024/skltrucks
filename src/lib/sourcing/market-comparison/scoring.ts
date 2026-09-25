import { hasPositiveRefrigeratedBodyEvidence } from "@/lib/sourcing/body-policy";
import { isIndividualListingUrl } from "@/lib/sourcing/search/map-candidates";
import {
  emptyFieldEvidence,
  vehicleIdentityKey,
  verifyComparableListingEvidence,
} from "@/lib/sourcing/market-comparison/evidence";
import {
  DEFAULT_MARKET_COMPARISON_RULES,
  type ComparableExclusionReason,
  type ComparableListingRaw,
  type LeadComparisonSnapshot,
  type MarketComparisonRules,
  type ScoredComparable,
} from "@/lib/sourcing/market-comparison/types";

export function canonicalizeComparableUrl(url: string): string {
  try {
    const u = new URL(String(url ?? "").trim());
    u.hash = "";
    const keys = [...u.searchParams.keys()];
    for (const k of keys) {
      if (/^(utm_|gclid|fbclid|mc_|ref$)/i.test(k) || k.toLowerCase() === "utm") {
        u.searchParams.delete(k);
      }
    }
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString().toLowerCase();
  } catch {
    return String(url ?? "").trim().toLowerCase();
  }
}

function blob(listing: ComparableListingRaw): string {
  return [
    listing.bodyType,
    listing.makeModel,
    listing.conditionNotes,
    listing.statusNotes,
    listing.evidenceNotes,
    listing.transmission,
    listing.engine,
  ]
    .join(" ")
    .toLowerCase();
}

export function detectComparableExclusion(
  listing: ComparableListingRaw,
  rules: MarketComparisonRules = DEFAULT_MARKET_COMPARISON_RULES
): ComparableExclusionReason | null {
  const url = String(listing.listingUrl ?? "").trim();
  if (!url || !isIndividualListingUrl(url)) return "invalid_or_hub_url";

  const text = blob(listing);
  if (/\b(salvage|wrecked|flood|damaged|parts\s*only|totaled)\b/.test(text)) {
    return "salvage_or_damaged";
  }
  if (hasPositiveRefrigeratedBodyEvidence(text)) return "reefer";
  if (
    listing.transmissionIsAutomatic === false ||
    (listing.transmissionIsAutomatic == null && /\bmanual\b|\bstd\b|\bstandard\b/.test(text))
  ) {
    return "manual_transmission";
  }
  if (listing.manufacturerGvwrLbs != null && listing.manufacturerGvwrLbs > rules.maxGvwrLbs) {
    return "over_max_gvwr";
  }
  if (/\bcab\s*\/?\s*chassis\b|\bchassis\s*cab\b/.test(text) && listing.boxLengthFt == null) {
    return "cab_chassis_without_box";
  }
  if (/\bsold\b|\bno longer available\b/.test(text) && !/\basking\b/.test(text)) {
    return "sold_historical";
  }

  const hasAsking = listing.askingPrice != null && Number.isFinite(listing.askingPrice) && listing.askingPrice > 0;
  if (!hasAsking) {
    if (listing.auctionCurrentBid != null || /\bauction\b|\bcurrent bid\b/.test(text)) {
      return "auction_without_asking_price";
    }
    return "missing_asking_price";
  }
  if (listing.mileage == null || !Number.isFinite(listing.mileage)) return "missing_mileage";
  if (listing.year == null || !String(listing.makeModel ?? "").trim()) return "insufficient_identity";

  const evidenceCheck = verifyComparableListingEvidence(listing);
  if (!evidenceCheck.ok) return evidenceCheck.reason;

  return null;
}

function normalizeModelKey(makeModel: string): string {
  return String(makeModel ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function modelsCompatible(leadModel: string, compModel: string): boolean {
  const a = normalizeModelKey(leadModel);
  const b = normalizeModelKey(compModel);
  if (!a || !b) return false;
  if (a === b) return true;
  const aTokens = new Set(a.split(" ").filter((t) => t.length > 1));
  const bTokens = b.split(" ").filter((t) => t.length > 1);
  const shared = bTokens.filter((t) => aTokens.has(t));
  if (shared.length >= 2) return true;
  if (shared.some((t) => /^(m2|4300|t270|t370|npr|nqr|isb)$/i.test(t))) return true;
  return false;
}

/**
 * Score and filter raw provider listings against the subject lead.
 * One bad listing excludes itself — never fails the whole comparison.
 */
export function scoreComparables(
  lead: LeadComparisonSnapshot,
  listings: ComparableListingRaw[],
  rules: MarketComparisonRules = DEFAULT_MARKET_COMPARISON_RULES
): { usable: ScoredComparable[]; excluded: ScoredComparable[] } {
  const seenUrls = new Set<string>();
  const seenVehicles = new Set<string>();
  const usable: ScoredComparable[] = [];
  const excluded: ScoredComparable[] = [];

  for (const raw of listings) {
    const listing: ComparableListingRaw = {
      ...raw,
      vin: String(raw.vin ?? "").trim(),
      stockNumber: String(raw.stockNumber ?? "").trim(),
      listingPageInspected: Boolean(raw.listingPageInspected),
      fieldEvidence: raw.fieldEvidence ?? emptyFieldEvidence(),
      evidenceNotes: String(raw.evidenceNotes ?? "").trim(),
    };

    const canonicalUrl = canonicalizeComparableUrl(listing.listingUrl);
    if (seenUrls.has(canonicalUrl) && canonicalUrl) {
      excluded.push({
        listing,
        usable: false,
        exclusionReason: "duplicate_url",
        matchScore: 0,
        includeReasons: [],
        differenceNotes: ["Duplicate listing URL"],
        canonicalUrl,
      });
      continue;
    }
    if (canonicalUrl) seenUrls.add(canonicalUrl);

    const vehicleKey = vehicleIdentityKey(listing);
    if (vehicleKey && seenVehicles.has(vehicleKey)) {
      excluded.push({
        listing,
        usable: false,
        exclusionReason: "duplicate_vehicle",
        matchScore: 0,
        includeReasons: [],
        differenceNotes: [
          `Same truck duplicated on another marketplace (${vehicleKey.startsWith("vin:") ? "VIN" : "stock number"})`,
        ],
        canonicalUrl,
      });
      continue;
    }

    const exclusionReason = detectComparableExclusion(listing, rules);
    if (exclusionReason) {
      excluded.push({
        listing,
        usable: false,
        exclusionReason,
        matchScore: 0,
        includeReasons: [],
        differenceNotes: [exclusionLabel(exclusionReason)],
        canonicalUrl,
      });
      continue;
    }

    const includeReasons: string[] = [];
    const differenceNotes: string[] = [];
    let score = 0;

    if (modelsCompatible(lead.makeModel, listing.makeModel)) {
      score += 30;
      includeReasons.push("Same or equivalent make/model");
    } else {
      differenceNotes.push(`Model differs (${listing.makeModel || "unknown"} vs ${lead.makeModel})`);
    }

    if (lead.year != null && listing.year != null) {
      const dy = Math.abs(lead.year - listing.year);
      if (dy <= rules.preferredYearDelta) {
        score += 20;
        includeReasons.push(`Model year within ±${rules.preferredYearDelta} (${listing.year})`);
      } else {
        differenceNotes.push(`Year delta ${dy} (lead ${lead.year} vs ${listing.year})`);
        score += Math.max(0, 10 - dy);
      }
    }

    if (lead.mileage != null && listing.mileage != null) {
      const dm = Math.abs(lead.mileage - listing.mileage);
      if (dm <= rules.preferredMileageDelta) {
        score += 20;
        includeReasons.push(
          `Mileage within ±${rules.preferredMileageDelta.toLocaleString()} (${listing.mileage.toLocaleString()} mi)`
        );
      } else {
        differenceNotes.push(
          `Mileage delta ${dm.toLocaleString()} mi (lead ${lead.mileage.toLocaleString()} vs ${listing.mileage.toLocaleString()})`
        );
        score += 5;
      }
    }

    if (lead.boxLengthFt != null && listing.boxLengthFt != null) {
      if (lead.boxLengthFt === listing.boxLengthFt) {
        score += 15;
        includeReasons.push(`Same box length (${listing.boxLengthFt}')`);
      } else {
        differenceNotes.push(`Box length ${listing.boxLengthFt}' vs lead ${lead.boxLengthFt}'`);
        if (Math.abs(lead.boxLengthFt - listing.boxLengthFt) <= 2) score += 8;
      }
    } else if (listing.boxLengthFt == null) {
      differenceNotes.push("Comparable box length not stated");
    }

    if (listing.engineIsCummins === true) {
      score += 8;
      includeReasons.push("Cummins engine supported");
    } else if (listing.engineIsCummins === false) {
      differenceNotes.push("Engine is not Cummins");
    }

    if (listing.transmissionIsAutomatic === true) {
      score += 8;
      includeReasons.push("Automatic transmission supported");
    }

    if (listing.manufacturerGvwrLbs != null && listing.manufacturerGvwrLbs <= rules.maxGvwrLbs) {
      score += 6;
      includeReasons.push(
        `GVWR ≤ ${rules.maxGvwrLbs.toLocaleString()} (${listing.manufacturerGvwrLbs.toLocaleString()})`
      );
    }

    if (lead.hasLiftgate != null && listing.hasLiftgate != null) {
      if (lead.hasLiftgate === listing.hasLiftgate) {
        score += 4;
        includeReasons.push(listing.hasLiftgate ? "Liftgate present" : "No liftgate (matches lead)");
      } else {
        differenceNotes.push(
          listing.hasLiftgate
            ? "Comparable has liftgate; lead does not"
            : "Lead has liftgate; comparable does not"
        );
      }
    }

    includeReasons.push("Individual listing page inspected with field evidence for price/year/model/mileage");

    const usableFlag =
      score >= 40 &&
      modelsCompatible(lead.makeModel, listing.makeModel) &&
      listing.askingPrice != null;

    const scored: ScoredComparable = {
      listing,
      usable: usableFlag,
      exclusionReason: usableFlag ? undefined : "insufficient_identity",
      matchScore: score,
      includeReasons,
      differenceNotes,
      canonicalUrl,
    };
    if (usableFlag) {
      if (vehicleKey) seenVehicles.add(vehicleKey);
      usable.push(scored);
    } else {
      if (!scored.differenceNotes.length) {
        scored.differenceNotes.push("Not a sufficiently close comparable (model/year/mileage/box)");
      }
      excluded.push(scored);
    }
  }

  usable.sort(
    (a, b) =>
      b.matchScore - a.matchScore || (a.listing.askingPrice ?? 0) - (b.listing.askingPrice ?? 0)
  );
  return { usable: usable.slice(0, rules.maxUsableComparables), excluded };
}

export function exclusionLabel(reason: ComparableExclusionReason): string {
  switch (reason) {
    case "invalid_or_hub_url":
      return "Not an individual listing URL (hub/category/invalid)";
    case "duplicate_url":
      return "Duplicate listing URL";
    case "duplicate_vehicle":
      return "Same truck duplicated across marketplaces (VIN/stock)";
    case "missing_asking_price":
      return "Missing verified asking price";
    case "missing_mileage":
      return "Missing mileage";
    case "auction_without_asking_price":
      return "Auction without current asking price";
    case "salvage_or_damaged":
      return "Salvage or damaged";
    case "reefer":
      return "Reefer body";
    case "manual_transmission":
      return "Manual transmission";
    case "over_max_gvwr":
      return "GVWR over 26,000 lbs";
    case "cab_chassis_without_box":
      return "Cab/chassis without a box";
    case "insufficient_identity":
      return "Insufficient information to compare safely";
    case "sold_historical":
      return "Sold / historical listing";
    case "unverified_listing_evidence":
      return "Search snippet only — individual listing page was not inspected/supported";
    case "unsupported_required_field":
      return "Listing evidence missing required price, year, model, or mileage support";
    case "field_evidence_mismatch":
      return "Field values do not match evidence from this listing URL";
    default:
      return reason;
  }
}
