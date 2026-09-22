/**
 * Safe server-side spreadsheet read for staff intake.
 * - SheetJS CE (`xlsx@0.20.3` via official cdn.sheetjs.com tarball)
 * - Uses stored values only (raw: false / cellDates false)
 * - Does not execute macros, external links, or formulas (bookVBA: false)
 * - Enforces size / row limits and file signatures
 */
import * as XLSX from "xlsx";
import { parseCsv, type CsvParseFailure } from "@/lib/sourcing/intake/csv";
import {
  WORKBOOK_ALLOWED_EXTENSIONS,
  WORKBOOK_MAX_BYTES,
  WORKBOOK_MAX_ROWS,
  WORKBOOK_MAX_SHEETS_SCANNED,
} from "@/lib/sourcing/intake/workbook/limits";
import { headerKey } from "@/lib/sourcing/intake/workbook/normalize";
import {
  detectWorkbookFormat,
  type DetectedWorkbook,
} from "@/lib/sourcing/intake/workbook/detect";

export type WorkbookParseFailure = {
  ok: false;
  error: string;
  code:
    | "empty"
    | "no_header"
    | "malformed"
    | "unsupported"
    | "too_large"
    | "too_many_rows"
    | "password_protected"
    | "unrecognized"
    | "unauthorized_extension";
};

export type WorkbookSheetRecords = {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
};

export type WorkbookParseSuccess = {
  ok: true;
  filename: string;
  detected: DetectedWorkbook;
  sheets: WorkbookSheetRecords[];
  active: WorkbookSheetRecords;
};

export type WorkbookParseResult = WorkbookParseSuccess | WorkbookParseFailure;

function extensionOf(filename: string): string {
  const m = filename.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return m ? m[1] : "";
}

function sniffKind(data: Buffer): "xlsx" | "xls" | "csv" | "unknown" {
  if (data.length >= 2 && data[0] === 0x50 && data[1] === 0x4b) return "xlsx"; // ZIP
  if (data.length >= 8 && data[0] === 0xd0 && data[1] === 0xcf) return "xls"; // OLE CFBF
  const head = data.subarray(0, Math.min(64, data.length)).toString("utf8");
  if (/^[\w",\s]+/.test(head) && head.includes(",")) return "csv";
  return "unknown";
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function sheetToRecords(
  sheet: XLSX.WorkSheet,
  sheetName: string
): WorkbookSheetRecords | WorkbookParseFailure {
  // header:1 → array-of-arrays; raw:false → formatted/stored display values (not live formulas)
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  if (!matrix.length) {
    return { ok: false, error: `Sheet "${sheetName}" has no rows.`, code: "empty" };
  }

  // Find header row: first non-empty row
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, matrix.length); i += 1) {
    const row = matrix[i] ?? [];
    if (row.some((c) => String(c ?? "").trim() !== "")) {
      headerIdx = i;
      break;
    }
  }

  const headerCells = (matrix[headerIdx] ?? []).map((c) => cellToString(c));
  if (!headerCells.some(Boolean)) {
    return { ok: false, error: `Sheet "${sheetName}" header row is missing.`, code: "no_header" };
  }

  const headers = headerCells.map((h) => headerKey(h));
  const rows: Record<string, string>[] = [];

  for (let r = headerIdx + 1; r < matrix.length; r += 1) {
    const cells = matrix[r] ?? [];
    if (!cells.some((c) => String(c ?? "").trim() !== "")) continue;
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      // Prefer first non-empty if duplicate header keys
      const val = cellToString(cells[idx]);
      if (record[h] && !val) return;
      if (!record[h] || val) record[h] = val;
    });
    // Keep original display headers for adapters that need Product Name etc.
    headerCells.forEach((orig, idx) => {
      if (!orig.trim()) return;
      const rawKey = `raw:${orig.trim()}`;
      record[rawKey] = cellToString(cells[idx]);
    });
    rows.push(record);
    if (rows.length > WORKBOOK_MAX_ROWS) {
      return {
        ok: false,
        error: `Workbook exceeds maximum of ${WORKBOOK_MAX_ROWS} data rows.`,
        code: "too_many_rows",
      };
    }
  }

  return { sheetName, headers: headerCells, rows };
}

function readHyperlinks(
  sheet: XLSX.WorkSheet
): Map<string, string> {
  const map = new Map<string, string>();
  const links = (sheet as XLSX.WorkSheet & { l?: Record<string, { Target?: string }> }).l;
  if (!links) return map;
  for (const [addr, link] of Object.entries(links)) {
    const target = link?.Target;
    if (target) map.set(addr.toUpperCase(), String(target).trim());
  }
  return map;
}

/**
 * Attach hyperlink targets onto rows for a known column display name (e.g. 3rd Party Insp).
 * Uses SheetJS `!links` / cell hyperlinks when present.
 */
export function attachColumnHyperlinks(
  sheet: XLSX.WorkSheet,
  records: WorkbookSheetRecords,
  columnDisplayName: string,
  outKey: string
): void {
  const headerRow = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (!headerRow.length) return;

  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, headerRow.length); i += 1) {
    if ((headerRow[i] ?? []).some((c) => String(c ?? "").trim())) {
      headerIdx = i;
      break;
    }
  }
  const headers = (headerRow[headerIdx] ?? []).map((c) => String(c ?? "").trim());
  const colIdx = headers.findIndex(
    (h) => headerKey(h) === headerKey(columnDisplayName) || h === columnDisplayName
  );
  if (colIdx < 0) return;

  const links = readHyperlinks(sheet);
  // Also check cell objects for .l
  const dataStart = headerIdx + 1;
  let dataRow = 0;
  for (let r = dataStart; r < headerRow.length && dataRow < records.rows.length; r += 1) {
    const cells = headerRow[r] ?? [];
    if (!cells.some((c) => String(c ?? "").trim())) continue;
    const addr = XLSX.utils.encode_cell({ r, c: colIdx });
    const cell = sheet[addr] as XLSX.CellObject | undefined;
    const target =
      links.get(addr.toUpperCase()) ||
      (cell && "l" in cell && cell.l && typeof cell.l === "object" && "Target" in cell.l
        ? String((cell.l as { Target?: string }).Target ?? "")
        : "");
    if (target) {
      records.rows[dataRow][outKey] = target.trim();
    }
    dataRow += 1;
  }
}

export function parseWorkbookBuffer(
  buffer: ArrayBuffer | Buffer,
  filename = "upload.xlsx"
): WorkbookParseResult {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (data.length === 0) {
    return { ok: false, error: "Uploaded file is empty.", code: "empty" };
  }
  if (data.length > WORKBOOK_MAX_BYTES) {
    return {
      ok: false,
      error: `File exceeds maximum size of ${Math.round(WORKBOOK_MAX_BYTES / (1024 * 1024))} MiB.`,
      code: "too_large",
    };
  }

  const ext = extensionOf(filename);
  const sniffed = sniffKind(data);

  if (ext && !(WORKBOOK_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      ok: false,
      error: `Unsupported extension "${ext}". Allowed: ${WORKBOOK_ALLOWED_EXTENSIONS.join(", ")}.`,
      code: "unauthorized_extension",
    };
  }

  // CSV path
  if (ext === ".csv" || (ext === "" && sniffed === "csv")) {
    const parsed = parseCsv(data.toString("utf8"));
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
        code: parsed.code === "source_failure" ? "malformed" : parsed.code,
      };
    }
    const sheet: WorkbookSheetRecords = {
      sheetName: "CSV",
      headers: parsed.headers,
      rows: parsed.rows,
    };
    const detected = detectWorkbookFormat({
      filename,
      sheetNames: ["CSV"],
      headersBySheet: { CSV: parsed.headers },
    });
    if ("error" in detected) {
      // Staff CSV still usable via generic path when columns match intake schema
      const soft: DetectedWorkbook = {
        format: "staff-csv",
        sheetName: "CSV",
        workbookDate: null,
        confidence: "medium",
        notes: [detected.error],
      };
      return { ok: true, filename, detected: soft, sheets: [sheet], active: sheet };
    }
    return { ok: true, filename, detected, sheets: [sheet], active: sheet };
  }

  if (sniffed === "unknown" && ext !== ".xls" && ext !== ".xlsx") {
    return {
      ok: false,
      error: "File signature is not a supported .xls / .xlsx / .csv workbook.",
      code: "unsupported",
    };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, {
      type: "buffer",
      cellDates: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      bookVBA: false,
      bookFiles: false,
      bookDeps: false,
      raw: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    if (/password|encrypt/i.test(msg)) {
      return {
        ok: false,
        error: "Password-protected workbooks are not supported.",
        code: "password_protected",
      };
    }
    return { ok: false, error: `Could not read workbook: ${msg}`, code: "malformed" };
  }

  if (!workbook.SheetNames?.length) {
    return { ok: false, error: "Workbook has no sheets.", code: "empty" };
  }

  const sheetNames = workbook.SheetNames.slice(0, WORKBOOK_MAX_SHEETS_SCANNED);
  const sheets: WorkbookSheetRecords[] = [];
  const headersBySheet: Record<string, string[]> = {};

  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const records = sheetToRecords(sheet, name);
    if ("ok" in records && records.ok === false) {
      // Skip empty sheets; fail only if all fail later
      continue;
    }
    const okRecords = records as WorkbookSheetRecords;
    headersBySheet[name] = okRecords.headers;
    sheets.push(okRecords);
  }

  if (!sheets.length) {
    return { ok: false, error: "Workbook has no readable data sheets.", code: "empty" };
  }

  const detected = detectWorkbookFormat({
    filename,
    sheetNames: sheets.map((s) => s.sheetName),
    headersBySheet,
  });

  if ("error" in detected) {
    return { ok: false, error: detected.error, code: "unrecognized" };
  }

  const active =
    sheets.find((s) => s.sheetName === detected.sheetName) ?? sheets[0];

  // Hogan: pull inspection hyperlinks when present
  if (detected.format === "hogan-wholesale") {
    const sheet = workbook.Sheets[active.sheetName];
    if (sheet) {
      attachColumnHyperlinks(sheet, active, "3rd Party Insp", "inspection_hyperlink");
      attachColumnHyperlinks(sheet, active, "3rd Party Inspection", "inspection_hyperlink");
    }
  }

  return { ok: true, filename, detected, sheets, active };
}

export function csvFailureToWorkbook(
  failure: CsvParseFailure
): WorkbookParseFailure {
  return {
    ok: false,
    error: failure.error,
    code: failure.code === "source_failure" ? "malformed" : failure.code,
  };
}