import type { ListedWeightTerm, SpecEvidence, TruckLeadInput } from "@/types/sourcing";
import {
  buildSourceListingId,
  buildSourceScope,
  canonicalizeListingUrl,
  normalizeVin,
} from "@/lib/sourcing/duplicates";
import { normalizePenskeExportRow } from "@/lib/sourcing/intake/penske-export";
import { emptySpecEvidence, normalizeSpecEvidence } from "@/lib/sourcing/intake/sources";

export interface CsvParseResult {
  ok: true;
  rows: Record<string, string>[];
  headers: string[];
}

export interface CsvParseFailure {
  ok: false;
  error: string;
  code: "empty" | "no_header" | "malformed" | "source_failure";
}

/**
 * Minimal RFC4180-ish CSV parser (quoted fields, commas, newlines).
 * Used for staff-reviewed intake — not a general spreadsheet suite.
 */
export function parseCsv(text: string): CsvParseResult | CsvParseFailure {
  if (text == null) {
    return { ok: false, error: "Source returned no data.", code: "source_failure" };
  }

  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) {
    return { ok: false, error: "CSV is empty.", code: "empty" };
  }

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }

  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  if (rows.length === 0) {
    return { ok: false, error: "CSV has no rows.", code: "empty" };
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  if (!headers.some(Boolean)) {
    return { ok: false, error: "CSV header row is missing.", code: "no_header" };
  }

  const records: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0].trim() === "") continue;
    if (cells.length !== headers.length) {
      // Allow trailing empty columns; reject gross mismatches
      if (Math.abs(cells.length - headers.length) > 2) {
        return {
          ok: false,
          error: `Row ${r + 1} has ${cells.length} columns; expected ${headers.length}.`,
          code: "malformed",
        };
      }
    }
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      record[h] = (cells[idx] ?? "").trim();
    });
    records.push(record);
  }

  return { ok: true, rows: records, headers };
}

function parseOptionalNumber(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number(String(raw).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseOptionalInt(raw: string | undefined): number | null {
  const n = parseOptionalNumber(raw);
  return n == null ? null : Math.round(n);
}

function parseOptionalBool(raw: string | undefined): boolean | null {
  if (!raw?.trim()) return null;
  const v = raw.trim().toLowerCase();
  if (["yes", "true", "1", "y"].includes(v)) return true;
  if (["no", "false", "0", "n"].includes(v)) return false;
  return null;
}

function get(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const found = row[key];
    if (found != null && String(found).trim() !== "") return String(found).trim();
  }
  return "";
}

/**
 * Gate claimed specs: without evidence, match fields stay unknown so the lead
 * lands in Needs verification for Cummins / automatic / box / manufacturer GVWR.
 */
export function applyEvidenceGate(input: {
  engineIsCummins: boolean | null;
  transmissionIsAutomatic: boolean | null;
  boxLengthFt: number | null;
  manufacturerGvwrLbs: number | null;
  listedWeightLbs: number | null;
  listedWeightTerm: ListedWeightTerm;
  gvwrDoorPlateVerified: boolean;
  evidence: SpecEvidence;
}): {
  engineIsCummins: boolean | null;
  transmissionIsAutomatic: boolean | null;
  boxLengthFt: number | null;
  manufacturerGvwrLbs: number | null;
  listedWeightLbs: number | null;
  listedWeightTerm: ListedWeightTerm;
  gvwrDoorPlateVerified: boolean;
  missingEvidence: string[];
  uncertaintyLabels: string[];
} {
  const missingEvidence: string[] = [];
  const uncertaintyLabels: string[] = [];

  let engineIsCummins = input.engineIsCummins;
  if (!input.evidence.engine?.trim()) {
    if (engineIsCummins != null) missingEvidence.push("engine");
    engineIsCummins = null;
    uncertaintyLabels.push("missing_engine_evidence");
  }

  let transmissionIsAutomatic = input.transmissionIsAutomatic;
  if (!input.evidence.transmission?.trim()) {
    if (transmissionIsAutomatic != null) missingEvidence.push("transmission");
    transmissionIsAutomatic = null;
    uncertaintyLabels.push("missing_transmission_evidence");
  }

  let boxLengthFt = input.boxLengthFt;
  if (!input.evidence.boxLength?.trim()) {
    if (boxLengthFt != null) missingEvidence.push("box_length");
    boxLengthFt = null;
    uncertaintyLabels.push("missing_box_length_evidence");
  }

  let manufacturerGvwrLbs = input.manufacturerGvwrLbs;
  let listedWeightLbs = input.listedWeightLbs;
  let listedWeightTerm = input.listedWeightTerm;
  let gvwrDoorPlateVerified = input.gvwrDoorPlateVerified;

  if (!input.evidence.gvwr?.trim()) {
    if (manufacturerGvwrLbs != null || listedWeightTerm === "gvwr") {
      missingEvidence.push("gvwr");
    }
    manufacturerGvwrLbs = null;
    gvwrDoorPlateVerified = false;
    if (listedWeightTerm === "gvwr") {
      listedWeightTerm = "unknown";
      listedWeightLbs = listedWeightLbs; // keep raw claim in verification notes path only
    }
    uncertaintyLabels.push("missing_gvwr_evidence");
  }

  return {
    engineIsCummins,
    transmissionIsAutomatic,
    boxLengthFt,
    manufacturerGvwrLbs,
    listedWeightLbs,
    listedWeightTerm,
    gvwrDoorPlateVerified,
    missingEvidence,
    uncertaintyLabels: [...new Set(uncertaintyLabels)],
  };
}

export interface IntakeRowResult {
  input: TruckLeadInput;
  dateObserved: string;
  missingEvidence: string[];
  rowErrors: string[];
}

export function csvRowToIntakeLead(
  row: Record<string, string>,
  defaults?: { sourceScope?: string; seedSource?: string }
): IntakeRowResult {
  const rowErrors: string[] = [];
  // Penske Used Trucks Excel/CSV exports use Unit + Eng/Trans/GVW columns — map first.
  const normalized = normalizePenskeExportRow(row);
  const seller = get(normalized, "seller", "source_name", "dealer", "company");
  const sourceUrl = get(normalized, "listing_url", "source_url", "url");
  const stockNumber = get(normalized, "stock_number", "stock", "stock_no", "unit");
  const sourceListingIdRaw = get(
    normalized,
    "source_listing_id",
    "listing_id",
    "stock_number",
    "stock",
    "unit"
  );
  const sourceScope = buildSourceScope({
    sourceScope: get(normalized, "source_scope") || defaults?.sourceScope || "",
    seller,
    sourceUrl,
  });
  const sourceListingId = buildSourceListingId({
    sourceListingId: sourceListingIdRaw,
    stockNumber,
  });

  if (!sourceScope || !sourceListingId) {
    rowErrors.push("Each row needs source_scope (or seller) and source_listing_id (or stock_number).");
  }
  if (!sourceUrl) {
    rowErrors.push("listing_url / source_url is required to preserve the original listing link.");
  }

  const evidence: SpecEvidence = normalizeSpecEvidence({
    engine: get(normalized, "engine_evidence", "cummins_evidence"),
    transmission: get(normalized, "transmission_evidence", "automatic_evidence"),
    boxLength: get(normalized, "box_length_evidence", "box_evidence"),
    gvwr: get(normalized, "gvwr_evidence", "manufacturer_gvwr_evidence"),
  });

  const claimedEngineIsCummins = parseOptionalBool(
    get(normalized, "engine_is_cummins", "is_cummins")
  );
  const claimedAuto = parseOptionalBool(
    get(normalized, "transmission_is_automatic", "is_automatic", "automatic")
  );
  const claimedBox = parseOptionalNumber(
    get(normalized, "box_length_ft", "box_length", "box_ft")
  );
  const claimedGvwr = parseOptionalInt(
    get(normalized, "manufacturer_gvwr_lbs", "gvwr_lbs", "manufacturer_gvwr")
  );
  const listedWeightLbs = parseOptionalInt(get(normalized, "listed_weight_lbs", "weight_lbs"));
  const weightTermRaw = get(normalized, "listed_weight_term", "weight_term").toLowerCase();
  const listedWeightTerm: ListedWeightTerm =
    weightTermRaw === "gvwr" || weightTermRaw === "gvw" || weightTermRaw === "other"
      ? weightTermRaw
      : "unknown";

  const gated = applyEvidenceGate({
    engineIsCummins: claimedEngineIsCummins,
    transmissionIsAutomatic: claimedAuto,
    boxLengthFt: claimedBox,
    manufacturerGvwrLbs: claimedGvwr,
    listedWeightLbs,
    listedWeightTerm,
    gvwrDoorPlateVerified: parseOptionalBool(get(normalized, "gvwr_door_plate_verified")) === true,
    evidence,
  });

  const dateObserved =
    get(normalized, "date_observed", "observed_at", "date_last_checked") ||
    new Date().toISOString().slice(0, 10);

  const notesParts: string[] = [];
  const notes = get(normalized, "notes", "verification_notes");
  if (notes) notesParts.push(notes);
  if (gated.missingEvidence.length) {
    notesParts.push(
      `Missing evidence for: ${gated.missingEvidence.join(", ")} (claimed values not used for match until evidenced).`
    );
  }
  // Preserve claimed GVWR text when evidence missing
  if (gated.uncertaintyLabels.includes("missing_gvwr_evidence") && claimedGvwr != null) {
    notesParts.push(`CSV claimed manufacturer GVWR ${claimedGvwr} lbs without evidence.`);
  }

  const vin = normalizeVin(get(normalized, "vin"));
  const input: TruckLeadInput = {
    seller: seller || sourceScope,
    supplierContactId: null,
    sourceUrl,
    sourceScope,
    sourceListingId,
    canonicalListingUrl: canonicalizeListingUrl(sourceUrl),
    stockNumber: stockNumber || sourceListingId,
    vin,
    year: parseOptionalInt(get(normalized, "year")),
    makeModel: get(normalized, "make_model", "make_and_model", "model"),
    boxLengthFt: gated.boxLengthFt,
    boxLengthRaw:
      get(normalized, "box_length_raw") || (claimedBox != null ? `${claimedBox}'` : ""),
    engine: get(normalized, "engine"),
    engineIsCummins: gated.engineIsCummins,
    transmission: get(normalized, "transmission"),
    transmissionIsAutomatic: gated.transmissionIsAutomatic,
    listedWeightLbs: gated.listedWeightLbs,
    listedWeightTerm: gated.listedWeightTerm,
    manufacturerGvwrLbs: gated.manufacturerGvwrLbs,
    gvwrDoorPlateVerified: gated.gvwrDoorPlateVerified,
    mileage: parseOptionalInt(get(normalized, "mileage", "odometer")),
    hasLiftgate: parseOptionalBool(get(normalized, "has_liftgate", "liftgate")),
    liftgateNotes: get(normalized, "liftgate_notes"),
    price: parseOptionalNumber(get(normalized, "price", "asking_price")),
    location: get(normalized, "location", "city_state"),
    drivingDistanceMiles: parseOptionalNumber(
      get(normalized, "driving_distance_miles", "distance_miles")
    ),
    distanceIsEstimate: parseOptionalBool(get(normalized, "distance_is_estimate")) ?? true,
    dateLastChecked: dateObserved.slice(0, 10),
    verificationNotes: notesParts.join("\n"),
    workflowStatus: "new",
    sklCallNotes: "",
    researchUncertaintyLabels: gated.uncertaintyLabels,
    isSeedResearch: false,
    seedSource:
      defaults?.seedSource ||
      get(normalized, "feed_label", "seed_source") ||
      "Staff-reviewed CSV intake",
    specEvidence: {
      ...emptySpecEvidence(),
      ...evidence,
    },
  };

  return {
    input,
    dateObserved: dateObserved.slice(0, 10),
    missingEvidence: gated.missingEvidence,
    rowErrors,
  };
}
