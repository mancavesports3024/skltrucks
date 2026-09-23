import { listingContentChanged } from "@/lib/sourcing/listing-content";
import { classifyLead } from "@/lib/sourcing/match";
import type { BuyingProfile, TruckLead, TruckLeadInput } from "@/types/sourcing";
import {
  csvRowToIntakeLead,
  parseCsv,
  type CsvParseFailure,
} from "@/lib/sourcing/intake/csv";
import { normalizeVin } from "@/lib/sourcing/duplicates";

export type IntakeApplyKind = "inserted" | "listing_change" | "seen_again";

export interface IntakeApplyPlan {
  kind: IntakeApplyKind;
  input: TruckLeadInput;
  existingId?: string;
  observedAt: string;
  listingFirstSeenAt: string;
  listingLastSeenAt: string;
  listingLastChangedAt: string;
  missingEvidence: string[];
  matchStatus: ReturnType<typeof classifyLead>["status"];
}

export interface IntakeBatchReport {
  sourceLabel: string;
  usableLeads: number;
  inserted: number;
  listingChanges: number;
  seenAgain: number;
  skippedInvalid: number;
  needsVerification: number;
  staffMustVerify: string[];
  errors: string[];
  plans: IntakeApplyPlan[];
  parseError?: CsvParseFailure;
}

function observedIso(dateObserved: string, now: Date): string {
  // Prefer date-only noon UTC to keep day stable; if already ISO, use as-is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateObserved)) {
    return `${dateObserved}T12:00:00.000Z`;
  }
  const parsed = new Date(dateObserved);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return now.toISOString();
}

/**
 * Find an existing lead by VIN (preferred) else source_scope + source_listing_id.
 */
export function findExistingLead(
  leads: TruckLead[],
  input: TruckLeadInput
): TruckLead | undefined {
  const vin = normalizeVin(input.vin);
  if (vin) {
    const byVin = leads.find((l) => normalizeVin(l.vin) === vin);
    if (byVin) return byVin;
  }
  const scope = input.sourceScope.trim().toLowerCase();
  const listingId = input.sourceListingId.trim().toLowerCase();
  if (!scope || !listingId) return undefined;
  return leads.find(
    (l) =>
      l.sourceScope.trim().toLowerCase() === scope &&
      l.sourceListingId.trim().toLowerCase() === listingId
  );
}

/**
 * Plan how one intake row should apply against existing leads.
 * Pure — no DB. Call notes on existing leads are preserved by the caller.
 */
export function planIntakeRow(
  input: TruckLeadInput,
  existing: TruckLead | undefined,
  profile: BuyingProfile,
  options: { dateObserved: string; missingEvidence: string[]; now?: Date }
): IntakeApplyPlan {
  const now = options.now ?? new Date();
  const observedAt = observedIso(options.dateObserved, now);
  const match = classifyLead(input, profile);

  if (!existing) {
    return {
      kind: "inserted",
      input,
      observedAt,
      listingFirstSeenAt: observedAt,
      listingLastSeenAt: observedAt,
      listingLastChangedAt: observedAt,
      missingEvidence: options.missingEvidence,
      matchStatus: match.status,
    };
  }

  // Preserve staff call notes / workflow when re-importing.
  // Unsafe or missing workbook hyperlinks must not erase an existing valid URL.
  const nextSourceUrl = input.sourceUrl.trim() || existing.sourceUrl;
  const nextCanonical =
    input.canonicalListingUrl.trim() || existing.canonicalListingUrl;
  const nextInspection =
    (input.specEvidence?.inspectionUrl || "").trim() ||
    (existing.specEvidence?.inspectionUrl || "").trim();
  const merged: TruckLeadInput = {
    ...input,
    sourceUrl: nextSourceUrl,
    canonicalListingUrl: nextCanonical,
    sklCallNotes: existing.sklCallNotes,
    workflowStatus: existing.workflowStatus === "new" ? input.workflowStatus : existing.workflowStatus,
    supplierContactId: input.supplierContactId ?? existing.supplierContactId,
    verificationNotes: [existing.verificationNotes, input.verificationNotes]
      .filter(Boolean)
      .join("\n")
      .trim(),
    researchUncertaintyLabels: [
      ...new Set([
        ...existing.researchUncertaintyLabels,
        ...input.researchUncertaintyLabels,
      ]),
    ],
    specEvidence: {
      ...existing.specEvidence,
      ...input.specEvidence,
      inspectionUrl: nextInspection,
    },
  };

  // Re-evaluate listing content after URL preservation so a blank workbook
  // hyperlink does not look like a listing change that clears sourceUrl.
  const contentChanged = listingContentChanged(existing, merged);
  const firstSeen = existing.listingFirstSeenAt || existing.createdAt || observedAt;
  const priorChanged = existing.listingLastChangedAt || firstSeen;

  if (contentChanged) {
    return {
      kind: "listing_change",
      input: merged,
      existingId: existing.id,
      observedAt,
      listingFirstSeenAt: firstSeen,
      listingLastSeenAt: observedAt,
      listingLastChangedAt: observedAt,
      missingEvidence: options.missingEvidence,
      matchStatus: classifyLead(merged, profile).status,
    };
  }

  return {
    kind: "seen_again",
    input: merged,
    existingId: existing.id,
    observedAt,
    listingFirstSeenAt: firstSeen,
    listingLastSeenAt: observedAt,
    listingLastChangedAt: priorChanged,
    missingEvidence: options.missingEvidence,
    matchStatus: classifyLead(merged, profile).status,
  };
}

/**
 * Parse CSV and build an intake batch report (pure).
 */
export function buildIntakeBatchFromCsv(
  csvText: string | null | undefined,
  existingLeads: TruckLead[],
  profile: BuyingProfile,
  options?: {
    sourceLabel?: string;
    defaultSourceScope?: string;
    now?: Date;
  }
): IntakeBatchReport {
  const sourceLabel = options?.sourceLabel ?? "Staff-reviewed CSV";
  const now = options?.now ?? new Date();

  if (csvText == null) {
    return {
      sourceLabel,
      usableLeads: 0,
      inserted: 0,
      listingChanges: 0,
      seenAgain: 0,
      skippedInvalid: 0,
      needsVerification: 0,
      staffMustVerify: ["Source failure: no CSV payload received."],
      errors: ["Source failure: no CSV payload received."],
      plans: [],
      parseError: {
        ok: false,
        error: "Source returned no data.",
        code: "source_failure",
      },
    };
  }

  const parsed = parseCsv(csvText);
  if (!parsed.ok) {
    return {
      sourceLabel,
      usableLeads: 0,
      inserted: 0,
      listingChanges: 0,
      seenAgain: 0,
      skippedInvalid: 0,
      needsVerification: 0,
      staffMustVerify: [`Source/parse failure: ${parsed.error}`],
      errors: [parsed.error],
      plans: [],
      parseError: parsed,
    };
  }

  const plans: IntakeApplyPlan[] = [];
  const errors: string[] = [];
  const staffMustVerify = new Set<string>();
  let skippedInvalid = 0;
  // Track within-batch inserts for subsequent row dedupe
  const batchLeads: TruckLead[] = [...existingLeads];

  parsed.rows.forEach((row, idx) => {
    const prepared = csvRowToIntakeLead(row, {
      sourceScope: options?.defaultSourceScope,
      seedSource: sourceLabel,
    });

    if (prepared.rowErrors.length) {
      skippedInvalid += 1;
      errors.push(`Row ${idx + 2}: ${prepared.rowErrors.join(" ")}`);
      return;
    }

    const existing = findExistingLead(batchLeads, prepared.input);
    const plan = planIntakeRow(prepared.input, existing, profile, {
      dateObserved: prepared.dateObserved,
      missingEvidence: prepared.missingEvidence,
      now,
    });
    plans.push(plan);

    if (plan.matchStatus === "needs_verification") {
      staffMustVerify.add(
        `${plan.input.seller} #${plan.input.stockNumber || plan.input.sourceListingId}: verify ${
          prepared.missingEvidence.length
            ? prepared.missingEvidence.join(", ")
            : "required specs / match reasons"
        }`
      );
    } else if (prepared.missingEvidence.length) {
      staffMustVerify.add(
        `${plan.input.seller} #${plan.input.stockNumber}: missing evidence ${prepared.missingEvidence.join(", ")}`
      );
    }

    // Synthetic lead for in-batch dedupe
    const synthetic: TruckLead = {
      id: plan.existingId || `batch-${idx}`,
      ...plan.input,
      matchStatus: plan.matchStatus,
      matchReasons: [],
      listingFirstSeenAt: plan.listingFirstSeenAt,
      listingLastChangedAt: plan.listingLastChangedAt,
      listingLastSeenAt: plan.listingLastSeenAt,
    };
    if (existing) {
      const i = batchLeads.findIndex((l) => l.id === existing.id);
      if (i >= 0) batchLeads[i] = synthetic;
    } else {
      batchLeads.push(synthetic);
    }
  });

  return {
    sourceLabel,
    usableLeads: plans.length,
    inserted: plans.filter((p) => p.kind === "inserted").length,
    listingChanges: plans.filter((p) => p.kind === "listing_change").length,
    seenAgain: plans.filter((p) => p.kind === "seen_again").length,
    skippedInvalid,
    needsVerification: plans.filter((p) => p.matchStatus === "needs_verification").length,
    staffMustVerify: [...staffMustVerify],
    errors,
    plans,
  };
}
