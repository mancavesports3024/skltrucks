import {
  CANADA,
  UNITED_STATES,
  countryRejectionReason,
  resolveLeadCountry,
} from "@/lib/sourcing/location/country";
import type {
  BuyingProfile,
  ConstraintOutcome,
  ListedWeightTerm,
  MatchReason,
  MatchResult,
  MatchStatus,
} from "@/types/sourcing";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

/** Specs used for matching — keeps UI/DB fields separate from pure evaluation. */
export interface LeadMatchInput {
  year: number | null;
  boxLengthFt: number | null;
  engineIsCummins: boolean | null;
  transmissionIsAutomatic: boolean | null;
  listedWeightLbs: number | null;
  listedWeightTerm: ListedWeightTerm;
  manufacturerGvwrLbs: number | null;
  gvwrDoorPlateVerified: boolean;
  mileage: number | null;
  hasLiftgate: boolean | null;
  drivingDistanceMiles: number | null;
  /** When true (workbook offline estimate), labels say straight-line — never driving. */
  distanceIsEstimate?: boolean;
  price: number | null;
  /** Free-text location used for US-only country resolution. */
  location?: string | null;
  /**
   * Explicit country when provided separately (CSV / form / workbook column).
   * Ambiguous `CA` means Canada here.
   */
  country?: string | null;
  /** Separate state/province field; ambiguous `CA` means California. */
  stateOrProvince?: string | null;
}

export function earliestAcceptedModelYear(
  profile: Pick<BuyingProfile, "maxAgeYears">,
  asOf: Date = new Date()
): number {
  return asOf.getFullYear() - profile.maxAgeYears;
}

/**
 * Manufacturer-rated GVWR for match comparison.
 *
 * - Door-plate verified values are preferred.
 * - Listing-stated GVWR (term "gvwr" + lbs, or manufacturerGvwrLbs from listing
 *   evidence) is used for pass/fail — including deterministic rejection when
 *   the value is at/over the profile max. Needs verification is only for
 *   genuinely missing or GVW-labeled (ambiguous) weights.
 * - A field labeled "GVW" is never treated as confirmed manufacturer GVWR.
 */
export function resolveManufacturerGvwrLbs(lead: LeadMatchInput): {
  value: number | null;
  outcome: ConstraintOutcome;
  note: string;
} {
  if (lead.gvwrDoorPlateVerified && lead.manufacturerGvwrLbs != null) {
    return {
      value: lead.manufacturerGvwrLbs,
      outcome: "pass", // value still compared separately
      note: "Door-plate manufacturer GVWR recorded",
    };
  }

  if (lead.listedWeightTerm === "gvwr" && lead.listedWeightLbs != null) {
    return {
      value: lead.listedWeightLbs,
      outcome: "pass",
      note: "Listing states manufacturer-rated GVWR",
    };
  }

  // Listing provided a manufacturer GVWR number (evidence present upstream)
  // even when OpenAI left listedWeightLbs empty — still compare for reject/pass.
  if (lead.manufacturerGvwrLbs != null) {
    return {
      value: lead.manufacturerGvwrLbs,
      outcome: "pass",
      note: lead.listedWeightTerm === "gvwr"
        ? "Listing states manufacturer-rated GVWR"
        : "Listing manufacturer GVWR value present",
    };
  }

  if (lead.listedWeightTerm === "gvw" && lead.listedWeightLbs != null) {
    return {
      value: null,
      outcome: "unknown",
      note: `Listing uses "GVW" (${lead.listedWeightLbs.toLocaleString()} lbs), not manufacturer-rated GVWR — request door-plate rating before confirming`,
    };
  }

  return {
    value: null,
    outcome: "unknown",
    note: "Manufacturer-rated GVWR unknown",
  };
}

function compareGvwr(
  value: number,
  profile: Pick<BuyingProfile, "maxGvwrLbs" | "gvwrMustBeStrictlyBelow">
): ConstraintOutcome {
  if (profile.gvwrMustBeStrictlyBelow) {
    return value < profile.maxGvwrLbs ? "pass" : "fail";
  }
  return value <= profile.maxGvwrLbs ? "pass" : "fail";
}

function boxLengthOutcome(
  boxLengthFt: number | null,
  allowed: number[]
): ConstraintOutcome {
  if (boxLengthFt == null) return "unknown";
  // Exact feet only — 26.5 / 26'6" etc. are not 26
  return allowed.some((n) => boxLengthFt === n) ? "pass" : "fail";
}

export function classifyLead(
  lead: LeadMatchInput,
  profile: BuyingProfile = DEFAULT_BUYING_PROFILE,
  asOf: Date = new Date()
): MatchResult {
  const reasons: MatchReason[] = [];
  const earliestYear = earliestAcceptedModelYear(profile, asOf);

  // --- Required: Cummins ---
  if (profile.requireCummins) {
    let outcome: ConstraintOutcome = "unknown";
    if (lead.engineIsCummins === true) outcome = "pass";
    else if (lead.engineIsCummins === false) outcome = "fail";
    reasons.push({
      code: "cummins",
      label:
        outcome === "fail"
          ? "Engine is not Cummins"
          : outcome === "pass"
            ? "Cummins engine"
            : "Engine brand unknown",
      outcome,
      required: true,
    });
  }

  // --- Required: Automatic ---
  if (profile.requireAutomatic) {
    let outcome: ConstraintOutcome = "unknown";
    if (lead.transmissionIsAutomatic === true) outcome = "pass";
    else if (lead.transmissionIsAutomatic === false) outcome = "fail";
    reasons.push({
      code: "automatic",
      label:
        outcome === "fail"
          ? "Transmission is not automatic"
          : outcome === "pass"
            ? "Automatic transmission"
            : "Transmission type unknown",
      outcome,
      required: true,
    });
  }

  // --- Required: Box length ---
  {
    const outcome = boxLengthOutcome(lead.boxLengthFt, profile.requiredBoxLengthsFt);
    reasons.push({
      code: "box_length",
      label:
        outcome === "fail"
          ? `Box length ${lead.boxLengthFt}' is not one of ${profile.requiredBoxLengthsFt.join("/")}'`
          : outcome === "pass"
            ? `Box length ${lead.boxLengthFt}' accepted`
            : "Box length unknown",
      outcome,
      required: true,
    });
  }

  // --- Required: Manufacturer GVWR ---
  {
    const resolved = resolveManufacturerGvwrLbs(lead);
    let outcome: ConstraintOutcome = resolved.outcome;
    let label = resolved.note;

    if (resolved.value != null) {
      outcome = compareGvwr(resolved.value, profile);
      if (outcome === "fail") {
        label = profile.gvwrMustBeStrictlyBelow
          ? `Manufacturer GVWR ${resolved.value.toLocaleString()} lbs is not strictly below ${profile.maxGvwrLbs.toLocaleString()}`
          : `Manufacturer GVWR ${resolved.value.toLocaleString()} lbs exceeds maximum ${profile.maxGvwrLbs.toLocaleString()} (reject ≥ ${
              profile.maxGvwrLbs + 1
            })`;
      } else {
        label = profile.gvwrMustBeStrictlyBelow
          ? `Manufacturer GVWR ${resolved.value.toLocaleString()} lbs accepted (strictly below ${profile.maxGvwrLbs.toLocaleString()})`
          : `Manufacturer GVWR ${resolved.value.toLocaleString()} lbs accepted (≤ ${profile.maxGvwrLbs.toLocaleString()})`;
      }
    }

    reasons.push({
      code: "gvwr",
      label,
      outcome,
      required: true,
    });
  }

  // --- Required: Mileage ---
  {
    let outcome: ConstraintOutcome = "unknown";
    let label = "Mileage unknown";
    if (lead.mileage != null) {
      outcome = lead.mileage <= profile.maxMileage ? "pass" : "fail";
      label =
        outcome === "pass"
          ? `Mileage ${lead.mileage.toLocaleString()} within max ${profile.maxMileage.toLocaleString()}`
          : `Mileage ${lead.mileage.toLocaleString()} exceeds max ${profile.maxMileage.toLocaleString()}`;
    }
    reasons.push({
      code: "mileage",
      label,
      outcome,
      required: true,
    });
  }

  // --- Required: Age / model year ---
  {
    let outcome: ConstraintOutcome = "unknown";
    let label = "Model year unknown";
    if (lead.year != null) {
      outcome = lead.year >= earliestYear ? "pass" : "fail";
      label =
        outcome === "pass"
          ? `Model year ${lead.year} accepted (earliest ${earliestYear})`
          : `Model year ${lead.year} older than earliest accepted ${earliestYear} (${profile.maxAgeYears}-year max age)`;
    }
    reasons.push({
      code: "age",
      label,
      outcome,
      required: true,
    });
  }

  // --- Preferred: Liftgate ---
  if (profile.preferLiftgate) {
    let outcome: MatchReason["outcome"] = "preferred_unknown";
    let label = "Liftgate status unknown";
    if (lead.hasLiftgate === true) {
      outcome = "preferred_pass";
      label = "Liftgate present (preferred)";
    } else if (lead.hasLiftgate === false) {
      outcome = "preferred_fail";
      label = "No liftgate (preferred, not required)";
    }
    reasons.push({
      code: "liftgate",
      label,
      outcome,
      required: false,
    });
  }

  // --- Required: United States only (before distance) ---
  const leadWithEvidence = lead as LeadMatchInput & {
    specEvidence?: { country?: string };
  };
  const countryResolution = resolveLeadCountry({
    location: lead.location,
    country: lead.country ?? leadWithEvidence.specEvidence?.country,
    stateOrProvince: lead.stateOrProvince,
  });
  {
    let outcome: ConstraintOutcome = "unknown";
    let label = "Country / location region unknown";
    if (countryResolution.kind === "us") {
      outcome = "pass";
      label = `Located in ${UNITED_STATES}`;
    } else if (countryResolution.kind === "foreign") {
      outcome = "fail";
      label = countryRejectionReason(countryResolution.country);
    }
    reasons.push({
      code: "country",
      label,
      outcome,
      required: true,
    });
  }

  // --- Required: Distance from origin (within preferred max miles) ---
  {
    let outcome: ConstraintOutcome = "unknown";
    const isEstimate = lead.distanceIsEstimate !== false;
    const milesNoun = isEstimate
      ? "Estimated straight-line distance"
      : "Driving distance";
    let label = `${milesNoun} unknown — not invented`;
    if (countryResolution.kind === "foreign") {
      // Explicit foreign trucks are rejected on country — do not treat missing
      // distance as the primary failure or invent a U.S. mileage.
      outcome = "fail";
      label =
        countryResolution.country === CANADA
          ? "Distance not evaluated for Canadian location"
          : `Distance not evaluated outside ${UNITED_STATES} (${countryResolution.country})`;
    } else if (lead.drivingDistanceMiles != null) {
      const miles = lead.drivingDistanceMiles;
      if (miles <= profile.preferredMaxDrivingMiles) {
        outcome = "pass";
        label = isEstimate
          ? `Estimated straight-line distance ~${miles} mi from ${profile.originLabel} (within ${profile.preferredMaxDrivingMiles})`
          : `~${miles} driving miles from ${profile.originLabel} (within ${profile.preferredMaxDrivingMiles})`;
      } else {
        outcome = "fail";
        label = isEstimate
          ? `Estimated straight-line distance ~${miles} mi from ${profile.originLabel} (outside ${profile.preferredMaxDrivingMiles}-mile radius)`
          : `~${miles} driving miles from ${profile.originLabel} (outside ${profile.preferredMaxDrivingMiles}-mile radius)`;
      }
    }
    reasons.push({
      code: "distance",
      label,
      outcome,
      required: true,
    });
  }

  // --- Price: shown, not filtered when unset ---
  if (profile.maxPrice == null) {
    reasons.push({
      code: "price",
      label:
        lead.price != null
          ? `Price $${lead.price.toLocaleString()} (no max price filter set)`
          : "Price unknown (no max price filter set)",
      outcome: "info",
      required: false,
    });
  } else {
    let outcome: ConstraintOutcome = "unknown";
    let label = "Price unknown";
    if (lead.price != null) {
      outcome = lead.price <= profile.maxPrice ? "pass" : "fail";
      label =
        outcome === "pass"
          ? `Price $${lead.price.toLocaleString()} within max $${profile.maxPrice.toLocaleString()}`
          : `Price $${lead.price.toLocaleString()} exceeds max $${profile.maxPrice.toLocaleString()}`;
    }
    reasons.push({
      code: "price",
      label,
      outcome,
      required: true,
    });
  }

  const required = reasons.filter((r) => r.required);
  const anyRequiredFail = required.some((r) => r.outcome === "fail");
  const anyRequiredUnknown = required.some((r) => r.outcome === "unknown");
  const allRequiredPass =
    required.length > 0 && required.every((r) => r.outcome === "pass");

  let status: MatchStatus;
  if (anyRequiredFail) {
    status = "does_not_match";
  } else if (anyRequiredUnknown) {
    // Unknown required specs (including distance) must never count as confirmed
    status = "needs_verification";
  } else if (allRequiredPass) {
    status = "confirmed_match";
  } else {
    status = "needs_verification";
  }

  return { status, reasons, earliestAcceptedModelYear: earliestYear };
}
