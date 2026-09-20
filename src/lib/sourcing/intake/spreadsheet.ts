/**
 * Parse staff intake spreadsheets (.csv / .xls / .xlsx) into row records.
 */
import * as XLSX from "xlsx";
import { parseCsv, type CsvParseFailure, type CsvParseResult } from "@/lib/sourcing/intake/csv";

function normalizeHeader(h: string): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function sheetToRecords(sheet: XLSX.WorkSheet): CsvParseResult | CsvParseFailure {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (!rows.length) {
    return { ok: false, error: "Spreadsheet has no data rows.", code: "empty" };
  }

  const headers = Object.keys(rows[0]).map(normalizeHeader);
  if (!headers.some(Boolean)) {
    return { ok: false, error: "Spreadsheet header row is missing.", code: "no_header" };
  }

  const records: Record<string, string>[] = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      const key = normalizeHeader(k);
      if (!key) continue;
      out[key] = String(v ?? "").trim();
    }
    return out;
  });

  return { ok: true, rows: records, headers };
}

export function parseSpreadsheetBuffer(
  buffer: ArrayBuffer | Buffer,
  filename = "upload.csv"
): CsvParseResult | CsvParseFailure {
  const name = filename.toLowerCase();
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return parseCsv(data.toString("utf8"));
  }

  if (name.endsWith(".xls") || name.endsWith(".xlsx")) {
    try {
      const workbook = XLSX.read(data, { type: "buffer", cellDates: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return { ok: false, error: "Spreadsheet has no sheets.", code: "empty" };
      }
      return sheetToRecords(workbook.Sheets[sheetName]);
    } catch (e) {
      return {
        ok: false,
        error: `Could not read spreadsheet: ${e instanceof Error ? e.message : "unknown error"}`,
        code: "malformed",
      };
    }
  }

  // Sniff: ZIP/xlsx starts with PK; OLE/xls is CDF
  if (data[0] === 0x50 && data[1] === 0x4b) {
    return parseSpreadsheetBuffer(data, "upload.xlsx");
  }
  if (data[0] === 0xd0 && data[1] === 0xcf) {
    return parseSpreadsheetBuffer(data, "upload.xls");
  }

  // Fallback: treat as CSV text
  return parseCsv(data.toString("utf8"));
}
