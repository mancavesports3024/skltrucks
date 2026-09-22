import { canonicalizeListingUrl, normalizeVin } from "@/lib/sourcing/duplicates";
import { estimateDistanceFromLocation } from "@/lib/sourcing/distance/estimate-from-location";
import { emptySpecEvidence } from "@/lib/sourcing/intake/sources";
import type { WorkbookParseSuccess } from "@/lib/sourcing/intake/workbook/parse";
import { mapPenskePreauctionRow } from "@/lib/sourcing/intake/workbook/penske-preauction";
import { mapHoganWholesaleRow } from "@/lib/sourcing/intake/workbook/hogan-wholesale";
import { csvRowToIntakeLead, type IntakeRowResult } from "@/lib/sourcing/intake/csv";
import type { ListedWeightTerm, SpecEvidence, TruckLeadInput } from "@/types/sourcing";

function weightFields(gvwLbs: number | null, gvwRaw: string): {
  listedWeightLbs: number | null;
  listedWeightTerm: ListedWeightTerm;
  manufacturerGvwrLbs: number | null;
} {
  if (gvwLbs == null) {
    return {
      listedWeightLbs: null,
      listedWeightTerm: gvwRaw.trim() ? "other" : "unknown",
      manufacturerGvwrLbs: null,
    };
  }
  // Authorized workbook GVW — retain term honesty, use numeric value for ≤26,000 classification.
  return {
    listedWeightLbs: gvwLbs,
    listedWeightTerm: "gvw",
    manufacturerGvwrLbs: gvwLbs,
  };
}

/** Apply offline Joplin straight-line distance when city+state resolve in the Census gazetteer. */
export function applyOfflineWorkbookDistance(
  location: string,
  evidence: SpecEvidence,
  uncertaintyLabels: string[]
): {
  drivingDistanceMiles: number | null;
  distanceIsEstimate: true;
  evidence: SpecEvidence;
  researchUncertaintyLabels: string[];
  missingDistance: boolean;
  distanceSummary: string;
} {
  const estimate = estimateDistanceFromLocation(location);
  const labels = uncertaintyLabels.filter((l) => l !== "distance_not_geocoded");

  if (estimate.ok) {
    return {
      drivingDistanceMiles: estimate.miles,
      distanceIsEstimate: true,
      evidence: { ...evidence, distance: estimate.evidenceText },
      researchUncertaintyLabels: labels,
      missingDistance: false,
      distanceSummary: `${estimate.methodLabel}: ${estimate.miles} mi (${estimate.resolved.display})`,
    };
  }

  return {
    drivingDistanceMiles: null,
    distanceIsEstimate: true,
    evidence: { ...evidence, distance: estimate.evidenceText },
    researchUncertaintyLabels: [...labels, "distance_not_geocoded"],
    missingDistance: true,
    distanceSummary: `Distance unknown (${estimate.reason})`,
  };
}

export function workbookRowsToIntake(
  parsed: WorkbookParseSuccess,
  options?: { dateObserved?: string }
): IntakeRowResult[] {
  const dateObserved =
    options?.dateObserved ||
    parsed.detected.workbookDate ||
    new Date().toISOString().slice(0, 10);

  if (parsed.detected.format === "staff-csv") {
    return parsed.active.rows.map((row) =>
      csvRowToIntakeLead(row, {
        sourceScope: undefined,
        seedSource: parsed.filename,
        allowMissingListingUrl: false,
      })
    );
  }

  if (parsed.detected.format === "penske-preauction") {
    return parsed.active.rows.map((row) => {
      const mapped = mapPenskePreauctionRow(row);
      if (!mapped) {
        return {
          input: emptyLeadShell(),
          dateObserved,
          missingEvidence: [],
          rowErrors: ["Row missing Unit identity."],
        };
      }
      const weights = weightFields(mapped.gvwLbs, mapped.gvwRaw);
      const distance = applyOfflineWorkbookDistance(
        mapped.location,
        { ...emptySpecEvidence(), ...mapped.evidence },
        [
          ...(mapped.gvwLbs != null ? ["workbook_gvw_not_door_plate"] : ["missing_or_ambiguous_gvw"]),
          ...(mapped.bodyRejectReason ? ["non_dry_van_body"] : []),
        ]
      );
      const input: TruckLeadInput = {
        seller: "Penske Pre-Auction",
        supplierContactId: null,
        sourceUrl: "",
        sourceScope: mapped.sourceScope,
        sourceListingId: mapped.sourceListingId,
        canonicalListingUrl: "",
        stockNumber: mapped.stockNumber,
        vin: normalizeVin(mapped.vin),
        year: mapped.year,
        makeModel: mapped.makeModel,
        boxLengthFt: mapped.bodyRejectReason ? 0 : mapped.boxLengthFt,
        boxLengthRaw: mapped.boxLengthRaw,
        engine: mapped.engine,
        engineIsCummins: mapped.engineIsCummins,
        transmission: mapped.transmission,
        transmissionIsAutomatic: mapped.transmissionIsAutomatic,
        listedWeightLbs: weights.listedWeightLbs,
        listedWeightTerm: weights.listedWeightTerm,
        manufacturerGvwrLbs: weights.manufacturerGvwrLbs,
        gvwrDoorPlateVerified: false,
        mileage: mapped.mileage,
        hasLiftgate: mapped.hasLiftgate,
        liftgateNotes: mapped.liftgateNotes,
        price: mapped.price,
        location: mapped.location,
        drivingDistanceMiles: distance.drivingDistanceMiles,
        distanceIsEstimate: distance.distanceIsEstimate,
        dateLastChecked: dateObserved,
        verificationNotes: mapped.notes.join("\n"),
        workflowStatus: "new",
        sklCallNotes: "",
        researchUncertaintyLabels: distance.researchUncertaintyLabels,
        isSeedResearch: false,
        seedSource: `Penske pre-auction workbook (${parsed.filename})`,
        specEvidence: distance.evidence,
      };

      const rowErrors: string[] = [];
      if (!mapped.vin && !mapped.sourceListingId) {
        rowErrors.push("Row needs VIN or Unit id.");
      }

      const missingEvidence: string[] = [];
      if (!mapped.evidence.engine?.trim()) missingEvidence.push("engine");
      if (!mapped.evidence.transmission?.trim()) missingEvidence.push("transmission");
      if (!mapped.evidence.boxLength?.trim() || mapped.boxLengthFt == null) {
        if (!mapped.bodyRejectReason) missingEvidence.push("box_length");
      }
      if (!mapped.evidence.gvwr?.trim() || mapped.gvwLbs == null) missingEvidence.push("gvwr");
      if (distance.missingDistance) missingEvidence.push("distance");

      return { input, dateObserved, missingEvidence, rowErrors };
    });
  }

  // Hogan
  return parsed.active.rows.map((row) => {
    const mapped = mapHoganWholesaleRow(row);
    if (!mapped) {
      return {
        input: emptyLeadShell(),
        dateObserved,
        missingEvidence: [],
        rowErrors: ["Row missing Unit # identity."],
      };
    }
    const weights = weightFields(mapped.gvwLbs, mapped.gvwRaw);
    const distance = applyOfflineWorkbookDistance(
      mapped.location,
      { ...emptySpecEvidence(), ...mapped.evidence },
      [
        ...(mapped.gvwLbs != null ? ["workbook_gvw_not_door_plate"] : ["missing_or_ambiguous_gvw"]),
        ...(mapped.bodyRejectReason ? ["non_dry_van_body"] : []),
        ...(mapped.looksCanadian ? ["canadian_location"] : []),
        ...(mapped.inspectionUrlError ? ["inspection_url_rejected"] : []),
        "availability_not_proven_by_completion_status",
      ]
    );
    const input: TruckLeadInput = {
      seller: "Hogan Wholesale",
      supplierContactId: null,
      sourceUrl: "",
      sourceScope: mapped.sourceScope,
      sourceListingId: mapped.sourceListingId,
      canonicalListingUrl: canonicalizeListingUrl(""),
      stockNumber: mapped.stockNumber,
      vin: "",
      year: mapped.year,
      makeModel: mapped.makeModel,
      boxLengthFt: mapped.bodyRejectReason ? 0 : mapped.boxLengthFt,
      boxLengthRaw: mapped.boxLengthRaw,
      engine: mapped.engine,
      engineIsCummins: mapped.engineIsCummins,
      transmission: mapped.transmission,
      transmissionIsAutomatic: mapped.transmissionIsAutomatic,
      listedWeightLbs: weights.listedWeightLbs,
      listedWeightTerm: weights.listedWeightTerm,
      manufacturerGvwrLbs: weights.manufacturerGvwrLbs,
      gvwrDoorPlateVerified: false,
      mileage: mapped.mileage,
      hasLiftgate: mapped.hasLiftgate,
      liftgateNotes: mapped.liftgateNotes,
      price: mapped.price,
      location: mapped.location,
      drivingDistanceMiles: distance.drivingDistanceMiles,
      distanceIsEstimate: distance.distanceIsEstimate,
      dateLastChecked: dateObserved,
      verificationNotes: mapped.notes.join("\n"),
      workflowStatus: "new",
      sklCallNotes: "",
      researchUncertaintyLabels: distance.researchUncertaintyLabels,
      isSeedResearch: false,
      seedSource: `Hogan wholesale workbook (${parsed.filename})`,
      specEvidence: distance.evidence,
    };

    const rowErrors: string[] = [];
    if (!mapped.sourceListingId) rowErrors.push("Row needs Unit #.");

    const missingEvidence: string[] = [];
    if (!mapped.evidence.engine?.trim()) missingEvidence.push("engine");
    if (!mapped.evidence.transmission?.trim()) missingEvidence.push("transmission");
    if (!mapped.evidence.boxLength?.trim() || mapped.boxLengthFt == null) {
      if (!mapped.bodyRejectReason) missingEvidence.push("box_length");
    }
    if (!mapped.evidence.gvwr?.trim() || mapped.gvwLbs == null) missingEvidence.push("gvwr");
    if (distance.missingDistance) missingEvidence.push("distance");

    return { input, dateObserved, missingEvidence, rowErrors };
  });
}

function emptyLeadShell(): TruckLeadInput {
  return {
    seller: "",
    supplierContactId: null,
    sourceUrl: "",
    sourceScope: "",
    sourceListingId: "",
    canonicalListingUrl: "",
    stockNumber: "",
    vin: "",
    year: null,
    makeModel: "",
    boxLengthFt: null,
    boxLengthRaw: "",
    engine: "",
    engineIsCummins: null,
    transmission: "",
    transmissionIsAutomatic: null,
    listedWeightLbs: null,
    listedWeightTerm: "unknown",
    manufacturerGvwrLbs: null,
    gvwrDoorPlateVerified: false,
    mileage: null,
    hasLiftgate: null,
    liftgateNotes: "",
    price: null,
    location: "",
    drivingDistanceMiles: null,
    distanceIsEstimate: true,
    dateLastChecked: null,
    verificationNotes: "",
    workflowStatus: "new",
    sklCallNotes: "",
    researchUncertaintyLabels: [],
    isSeedResearch: false,
    seedSource: "",
    specEvidence: emptySpecEvidence(),
  };
}
