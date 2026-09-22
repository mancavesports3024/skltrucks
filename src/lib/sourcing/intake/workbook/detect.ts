import { headerKey } from "@/lib/sourcing/intake/workbook/normalize";

export type WorkbookFormatId = "penske-preauction" | "hogan-wholesale" | "staff-csv";

export interface DetectedWorkbook {
  format: WorkbookFormatId;
  sheetName: string;
  workbookDate: string | null;
  confidence: "high" | "medium";
  notes: string[];
}

function headerSet(headers: string[]): Set<string> {
  return new Set(headers.map(headerKey).filter(Boolean));
}

function hasAny(set: Set<string>, keys: string[]): boolean {
  return keys.some((k) => set.has(k));
}

/** Penske pre-auction Medium Duty signature (not filename). */
export function isPenskePreauctionHeaders(headers: string[]): boolean {
  const set = headerSet(headers);
  const hasUnit = hasAny(set, ["unit", "unit_number"]);
  const hasVin = hasAny(set, ["vin", "vin_number"]);
  const hasEngineMake = hasAny(set, ["engine_make", "eng_make"]);
  const hasMiles = hasAny(set, ["miles", "ltd_miles"]);
  const hasGvw = hasAny(set, ["gvw", "gvw_lbs"]);
  const hasDescription = set.has("description");
  const hasPenskeStatus = hasAny(set, ["penske_status", "status"]);
  const hasCityState = set.has("city") && set.has("state");
  // Distinct from public "All Category Results" Eng Mfr export
  const looksLikePublicExport = hasAny(set, ["eng_mfr", "ltd_miles", "gvw_(lbs)", "sale_price"]);
  if (looksLikePublicExport && !hasDescription && !hasEngineMake) return false;
  return (
    hasUnit &&
    hasVin &&
    hasGvw &&
    hasMiles &&
    (hasEngineMake || hasDescription) &&
    (hasCityState || hasPenskeStatus || hasDescription)
  );
}

/** Hogan wholesale list signature. */
export function isHoganWholesaleHeaders(headers: string[]): boolean {
  const set = headerSet(headers);
  return (
    hasAny(set, ["unit", "unit_number"]) &&
    hasAny(set, ["wholesale_price", "price"]) &&
    hasAny(set, ["product_name", "make"]) &&
    hasAny(set, ["miles_hrs", "miles", "miles_hrs_"]) &&
    hasAny(set, ["gvw", "gvw_"]) &&
    hasAny(set, ["length", "box_length"]) &&
    (hasAny(set, ["3rd_party_insp", "third_party_insp", "3rd_party_inspection"]) ||
      hasAny(set, ["o_s_status", "os_status", "os_location"]))
  );
}

export function detectPenskeSheetName(sheetNames: string[]): string | null {
  const exact = sheetNames.find((n) => /^medium\s*duty$/i.test(n.trim()));
  if (exact) return exact;
  const soft = sheetNames.find((n) => /medium\s*duty/i.test(n));
  return soft ?? null;
}

export function extractWorkbookDate(
  filename: string,
  sheetNames: string[],
  sampleCells: string[]
): string | null {
  const blob = [filename, ...sheetNames, ...sampleCells].join(" ");
  // 9.21.26 or 9/21/26 or 2026-09-21
  const mdy = blob.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (mdy) {
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const iso = blob.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

export function detectWorkbookFormat(input: {
  filename: string;
  sheetNames: string[];
  headersBySheet: Record<string, string[]>;
  sampleCells?: string[];
}): DetectedWorkbook | { error: string } {
  const notes: string[] = [];
  const penskeSheet = detectPenskeSheetName(input.sheetNames);
  if (penskeSheet) {
    const headers = input.headersBySheet[penskeSheet] ?? [];
    if (isPenskePreauctionHeaders(headers)) {
      return {
        format: "penske-preauction",
        sheetName: penskeSheet,
        workbookDate: extractWorkbookDate(
          input.filename,
          input.sheetNames,
          input.sampleCells ?? headers
        ),
        confidence: "high",
        notes: [`Using Penske sheet "${penskeSheet}" only.`],
      };
    }
    notes.push(
      `Found sheet "${penskeSheet}" but headers did not match Penske pre-auction Medium Duty signature.`
    );
  }

  // Scan all sheets for Hogan / Penske headers
  for (const sheetName of input.sheetNames) {
    const headers = input.headersBySheet[sheetName] ?? [];
    if (isHoganWholesaleHeaders(headers)) {
      return {
        format: "hogan-wholesale",
        sheetName,
        workbookDate: extractWorkbookDate(
          input.filename,
          input.sheetNames,
          input.sampleCells ?? headers
        ),
        confidence: "high",
        notes,
      };
    }
    if (!penskeSheet && isPenskePreauctionHeaders(headers)) {
      return {
        format: "penske-preauction",
        sheetName,
        workbookDate: extractWorkbookDate(
          input.filename,
          input.sheetNames,
          input.sampleCells ?? headers
        ),
        confidence: "medium",
        notes: [...notes, `Penske pre-auction detected on sheet "${sheetName}".`],
      };
    }
  }

  // Generic CSV with staff columns
  for (const sheetName of input.sheetNames) {
    const set = headerSet(input.headersBySheet[sheetName] ?? []);
    if (
      (set.has("listing_url") || set.has("source_url")) &&
      (set.has("source_listing_id") || set.has("stock_number")) 
    ) {
      return {
        format: "staff-csv",
        sheetName,
        workbookDate: extractWorkbookDate(input.filename, input.sheetNames, []),
        confidence: "medium",
        notes: [...notes, "Treated as staff-reviewed CSV columns."],
      };
    }
  }

  return {
    error:
      "Unrecognized workbook. Expected Penske pre-auction (Medium Duty sheet) or Hogan wholesale headers, or a staff CSV with listing_url + stock/source id.",
  };
}