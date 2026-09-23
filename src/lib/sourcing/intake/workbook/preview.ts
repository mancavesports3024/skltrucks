import { classifyLead } from "@/lib/sourcing/match";
import { estimateDistanceFromLocation } from "@/lib/sourcing/distance/estimate-from-location";
import {
  resolveLeadCountry,
  shouldSkipUsDistanceLookup,
} from "@/lib/sourcing/location/country";
import {
  findExistingLead,
  planIntakeRow,
  type IntakeApplyPlan,
  type IntakeBatchReport,
} from "@/lib/sourcing/intake/import";
import { parseWorkbookBuffer, type WorkbookParseFailure } from "@/lib/sourcing/intake/workbook/parse";
import { workbookRowsToIntake } from "@/lib/sourcing/intake/workbook/to-intake";
import type { BuyingProfile, MatchStatus, TruckLead } from "@/types/sourcing";

export type WorkbookPreviewRow = {
  rowNumber: number;
  unit: string;
  vin: string;
  year: number | null;
  makeModel: string;
  mileage: number | null;
  price: number | null;
  location: string;
  /** Resolved city/state from offline gazetteer, when known. */
  resolvedLocation: string | null;
  /** Estimated straight-line miles from Joplin, or null when unresolved. */
  estimatedDistanceMiles: number | null;
  /** Human-readable distance method / failure. */
  distanceNote: string;
  gvwLbs: number | null;
  matchStatus: MatchStatus;
  applyKind: IntakeApplyPlan["kind"] | "invalid";
  summary: string;
  reasons: string[];
  /** Safe validated hyperlink for Preview UI (listing or inspection). */
  hyperlinkUrl: string;
  hyperlinkKind: "listing" | "inspection" | "none";
  hyperlinkNote: string;
};

export type WorkbookPreviewReport = IntakeBatchReport & {
  detectedFormat: string;
  sheetName: string;
  workbookDate: string | null;
  filename: string;
  confirmed: number;
  rejected: number;
  previewRows: WorkbookPreviewRow[];
  workbookParseError?: WorkbookParseFailure;
};

/**
 * Staff preview: parse + classify only. Does not persist.
 * Never calls OpenAI or Tavily.
 */
export function buildWorkbookPreview(
  buffer: ArrayBuffer | Buffer,
  filename: string,
  existingLeads: TruckLead[],
  profile: BuyingProfile,
  options?: { now?: Date; sourceLabel?: string }
): WorkbookPreviewReport {
  const now = options?.now ?? new Date();
  const parsed = parseWorkbookBuffer(buffer, filename);

  if (!parsed.ok) {
    return {
      sourceLabel: options?.sourceLabel ?? filename,
      usableLeads: 0,
      inserted: 0,
      listingChanges: 0,
      seenAgain: 0,
      skippedInvalid: 0,
      needsVerification: 0,
      staffMustVerify: [parsed.error],
      errors: [parsed.error],
      plans: [],
      parseError: undefined,
      detectedFormat: "unknown",
      sheetName: "",
      workbookDate: null,
      filename,
      confirmed: 0,
      rejected: 0,
      previewRows: [],
      workbookParseError: parsed,
    };
  }

  const prepared = workbookRowsToIntake(parsed);
  const plans: IntakeApplyPlan[] = [];
  const errors: string[] = [];
  const staffMustVerify = new Set<string>();
  let skippedInvalid = 0;
  const batchLeads: TruckLead[] = [...existingLeads];
  const previewRows: WorkbookPreviewRow[] = [];

  prepared.forEach((row, idx) => {
    if (row.rowErrors.length) {
      skippedInvalid += 1;
      errors.push(`Row ${idx + 1}: ${row.rowErrors.join(" ")}`);
      previewRows.push({
        rowNumber: idx + 1,
        unit: "",
        vin: "",
        year: null,
        makeModel: "",
        mileage: null,
        price: null,
        location: "",
        resolvedLocation: null,
        estimatedDistanceMiles: null,
        distanceNote: "Distance unknown",
        gvwLbs: null,
        matchStatus: "does_not_match",
        applyKind: "invalid",
        summary: row.rowErrors.join(" "),
        reasons: row.rowErrors,
        hyperlinkUrl: "",
        hyperlinkKind: "none",
        hyperlinkNote: "",
      });
      return;
    }

    const existing = findExistingLead(batchLeads, row.input);
    const plan = planIntakeRow(row.input, existing, profile, {
      dateObserved: row.dateObserved,
      missingEvidence: row.missingEvidence,
      now,
    });
    plans.push(plan);

    const match = classifyLead(plan.input, profile);
    const reasonLabels = match.reasons
      .filter((r) => r.outcome === "fail" || r.outcome === "unknown")
      .map((r) => r.label);

    if (plan.matchStatus === "needs_verification") {
      staffMustVerify.add(
        `${plan.input.seller} #${plan.input.stockNumber || plan.input.sourceListingId}: verify ${
          row.missingEvidence.length ? row.missingEvidence.join(", ") : "required specs"
        }`
      );
    }

    const countryResolution = resolveLeadCountry({
      location: plan.input.location,
      country: plan.input.specEvidence?.country,
    });
    let distanceNote: string;
    let resolvedLocation: string | null = null;
    if (shouldSkipUsDistanceLookup(countryResolution) && countryResolution.kind === "foreign") {
      distanceNote =
        plan.input.specEvidence?.distance ||
        `Distance not evaluated — Outside allowed country: ${countryResolution.country}`;
    } else {
      const distanceEstimate = estimateDistanceFromLocation(plan.input.location);
      distanceNote = distanceEstimate.ok
        ? `${distanceEstimate.methodLabel}: ${distanceEstimate.miles} mi → ${distanceEstimate.resolved.display}`
        : `Distance unknown (${distanceEstimate.reason})`;
      resolvedLocation = distanceEstimate.ok ? distanceEstimate.resolved.display : null;
    }

    const listingUrl = (plan.input.sourceUrl || plan.input.canonicalListingUrl || "").trim();
    const inspectionUrl = (plan.input.specEvidence?.inspectionUrl || "").trim();
    let hyperlinkUrl = "";
    let hyperlinkKind: WorkbookPreviewRow["hyperlinkKind"] = "none";
    let hyperlinkNote =
      plan.input.specEvidence?.hyperlinkValidation ||
      plan.input.verificationNotes
        .split("\n")
        .find(
          (line) =>
            /hyperlink|listing link|inspection link|No hyperlink/i.test(line)
        ) ||
      "";
    if (listingUrl) {
      hyperlinkUrl = listingUrl;
      hyperlinkKind = "listing";
      hyperlinkNote = "Individual listing link found";
    } else if (inspectionUrl) {
      hyperlinkUrl = inspectionUrl;
      hyperlinkKind = "inspection";
      hyperlinkNote = "Inspection link found";
    } else if (plan.input.specEvidence?.hyperlinkDestinationType === "rejected") {
      hyperlinkNote =
        plan.input.specEvidence.hyperlinkValidation
          ? `Workbook hyperlink rejected: ${plan.input.specEvidence.hyperlinkValidation}`
          : "Workbook hyperlink rejected";
    } else if (plan.input.specEvidence?.hyperlinkDestinationType === "missing") {
      hyperlinkNote = "No hyperlink provided";
    }

    previewRows.push({
      rowNumber: idx + 1,
      unit: plan.input.sourceListingId || plan.input.stockNumber,
      vin: plan.input.vin,
      year: plan.input.year,
      makeModel: plan.input.makeModel,
      mileage: plan.input.mileage,
      price: plan.input.price,
      location: plan.input.location,
      resolvedLocation,
      estimatedDistanceMiles: plan.input.drivingDistanceMiles,
      distanceNote,
      gvwLbs: plan.input.manufacturerGvwrLbs ?? plan.input.listedWeightLbs,
      matchStatus: plan.matchStatus,
      applyKind: plan.kind,
      summary:
        plan.matchStatus === "confirmed_match"
          ? "Confirmed match"
          : plan.matchStatus === "does_not_match"
            ? "Rejected"
            : "Needs verification",
      reasons: reasonLabels,
      hyperlinkUrl,
      hyperlinkKind,
      hyperlinkNote,
    });

    const synthetic: TruckLead = {
      id: plan.existingId || `batch-${idx}`,
      ...plan.input,
      matchStatus: plan.matchStatus,
      matchReasons: match.reasons,
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
    sourceLabel: options?.sourceLabel ?? `${parsed.detected.format} (${parsed.filename})`,
    usableLeads: plans.length,
    inserted: plans.filter((p) => p.kind === "inserted").length,
    listingChanges: plans.filter((p) => p.kind === "listing_change").length,
    seenAgain: plans.filter((p) => p.kind === "seen_again").length,
    skippedInvalid,
    needsVerification: plans.filter((p) => p.matchStatus === "needs_verification").length,
    staffMustVerify: [...staffMustVerify].slice(0, 200),
    errors,
    plans,
    detectedFormat: parsed.detected.format,
    sheetName: parsed.detected.sheetName,
    workbookDate: parsed.detected.workbookDate,
    filename: parsed.filename,
    confirmed: plans.filter((p) => p.matchStatus === "confirmed_match").length,
    rejected: plans.filter((p) => p.matchStatus === "does_not_match").length,
    previewRows,
  };
}

/**
 * Persist a previously planned workbook batch (staff clicked Import after preview).
 * Caller supplies the same buffer again — nothing is persisted until this runs.
 */
export function buildWorkbookImportPlans(
  buffer: ArrayBuffer | Buffer,
  filename: string,
  existingLeads: TruckLead[],
  profile: BuyingProfile,
  options?: { now?: Date; sourceLabel?: string }
): WorkbookPreviewReport {
  return buildWorkbookPreview(buffer, filename, existingLeads, profile, options);
}