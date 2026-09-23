#!/usr/bin/env node
/**
 * Safe offline inspection of a Penske pre-auction workbook's Unit Number hyperlinks.
 * - No HTTP requests
 * - Masks unit IDs and sensitive query values
 * - Does not print VINs or full URLs with secrets
 *
 * Usage:
 *   node --import tsx scripts/inspect-penske-unit-hyperlinks.mts [path-to.xls]
 */
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import {
  classifyPenskeUnitHyperlink,
  extractWorkbookHyperlinkTarget,
  maskHyperlinkForDiagnostics,
} from "../src/lib/sourcing/intake/workbook/unit-hyperlink.ts";

function maskUnit(unit: string): string {
  const s = String(unit).trim();
  if (s.length <= 4) return "***";
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}

function maskPathIds(pathPattern: string): string {
  return pathPattern
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/{uuid}")
    .replace(/\/[0-9a-f]{16,}/gi, "/{hex}")
    .replace(/\/[A-Za-z0-9_-]{20,}/g, "/{token}")
    .replace(/\/\d{4,}/g, "/{id}");
}

function main() {
  const arg = process.argv[2];
  const candidates = [
    arg,
    path.join(process.cwd(), "tmp-workbooks", "Pre-Auction-For-Sale-List-9.21.26.xls"),
    path.join(process.cwd(), "tmp-workbooks", "penske-9.21.26.xls"),
    path.join(process.cwd(), "tmp-workbooks", "penske-used-trucks.xls"),
  ].filter(Boolean) as string[];

  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: "Real Penske workbook not found locally",
          searched: candidates,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, {
    type: "buffer",
    bookVBA: false,
    cellHTML: false,
    bookFiles: false,
    bookDeps: false,
    raw: false,
  });

  const summary = {
    file: path.basename(file),
    sheets: [] as unknown[],
    totals: {
      unitCells: 0,
      withLTarget: 0,
      withHyperlinkFormula: 0,
      withHyperlink: 0,
      listingUrl: 0,
      inspectionUrl: 0,
      rejected: 0,
      missing: 0,
    },
    hosts: {} as Record<string, number>,
    pathPatterns: {} as Record<string, number>,
    queryKeyNamesSeen: [] as string[],
    credentialLikeQueryKeys: [] as string[],
    rejectReasons: {} as Record<string, number>,
    sensitiveNamedParams: {
      session: 0,
      token: 0,
      signature: 0,
      clientId: 0,
      userinfo: 0,
      fragment: 0,
      expiring: 0,
    },
  };

  const queryKeys = new Set<string>();
  const credKeys = new Set<string>();

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    let headerIdx = 0;
    for (let i = 0; i < Math.min(10, matrix.length); i++) {
      if ((matrix[i] ?? []).some((c) => String(c ?? "").trim())) {
        headerIdx = i;
        break;
      }
    }
    const headers = (matrix[headerIdx] ?? []).map((c) => String(c ?? "").trim());
    const unitCol = headers.findIndex((h) =>
      /^(unit|unit number|unit #)$/i.test(h.trim())
    );
    if (unitCol < 0) continue;

    let unitCells = 0;
    let withHyperlink = 0;
    let withLTarget = 0;
    let withFormula = 0;
    const links = (sheet as XLSX.WorkSheet & { l?: Record<string, { Target?: string }> }).l || {};

    for (let r = headerIdx + 1; r < matrix.length; r++) {
      const cells = matrix[r] ?? [];
      if (!cells.some((c) => String(c ?? "").trim())) continue;
      const unit = String(cells[unitCol] ?? "").trim();
      if (!unit) continue;
      unitCells += 1;
      summary.totals.unitCells += 1;

      const addr = XLSX.utils.encode_cell({ r, c: unitCol });
      const cell = sheet[addr] as XLSX.CellObject | undefined;
      const lTarget =
        links[addr]?.Target ||
        links[addr.toUpperCase()]?.Target ||
        (cell && "l" in cell && cell.l && typeof cell.l === "object"
          ? String((cell.l as { Target?: string }).Target ?? "")
          : "");
      if (lTarget) {
        withLTarget += 1;
        summary.totals.withLTarget += 1;
      }
      if (cell && typeof cell.f === "string" && /HYPERLINK\s*\(/i.test(cell.f)) {
        withFormula += 1;
        summary.totals.withHyperlinkFormula += 1;
      }

      const target = (lTarget || extractWorkbookHyperlinkTarget(cell) || "").trim();

      if (!target) {
        summary.totals.missing += 1;
        continue;
      }
      withHyperlink += 1;
      summary.totals.withHyperlink += 1;

      const masked = maskHyperlinkForDiagnostics(target);
      const pathPattern = maskPathIds(masked.pathPattern);
      summary.hosts[masked.hostname] = (summary.hosts[masked.hostname] || 0) + 1;
      summary.pathPatterns[pathPattern] =
        (summary.pathPatterns[pathPattern] || 0) + 1;
      for (const k of masked.queryKeyNames) {
        queryKeys.add(k);
        if (/(token|auth|session|client|api[_-]?key|signature|window_name|request)/i.test(k)) {
          credKeys.add(k);
        }
      }

      try {
        const u = new URL(target);
        if (u.username || u.password) summary.sensitiveNamedParams.userinfo += 1;
        if (u.hash && u.hash.replace(/^#/, "").length > 0) {
          summary.sensitiveNamedParams.fragment += 1;
        }
        for (const k of u.searchParams.keys()) {
          const lk = k.toLowerCase();
          if (/session/.test(lk)) summary.sensitiveNamedParams.session += 1;
          if (/token/.test(lk)) summary.sensitiveNamedParams.token += 1;
          if (/sig(nature)?$/.test(lk) || lk === "signature") {
            summary.sensitiveNamedParams.signature += 1;
          }
          if (/client[_-]?id/.test(lk)) summary.sensitiveNamedParams.clientId += 1;
          if (/^exp(ire|ires|iry)?$/.test(lk)) summary.sensitiveNamedParams.expiring += 1;
        }
      } catch {
        /* ignore */
      }

      const classified = classifyPenskeUnitHyperlink(target);
      if (classified.kind === "listingUrl") summary.totals.listingUrl += 1;
      else if (classified.kind === "inspectionUrl") summary.totals.inspectionUrl += 1;
      else if (classified.kind === "rejected") {
        summary.totals.rejected += 1;
        summary.rejectReasons[classified.reason] =
          (summary.rejectReasons[classified.reason] || 0) + 1;
      } else summary.totals.missing += 1;

      void maskUnit(unit); // ensure mask helper stays used without printing units
    }

    summary.sheets.push({
      sheet: name,
      unitColumn: headers[unitCol],
      unitCells,
      withHyperlink,
      withLTarget,
      withHyperlinkFormula: withFormula,
    });
  }

  summary.queryKeyNamesSeen = [...queryKeys].sort();
  summary.credentialLikeQueryKeys = [...credKeys].sort();

  console.log(JSON.stringify(summary, null, 2));
}

main();
