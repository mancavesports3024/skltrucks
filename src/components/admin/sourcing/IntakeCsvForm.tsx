"use client";

import { useState } from "react";
import {
  importCsvIntakeAction,
  importWorkbookIntakeAction,
  previewWorkbookIntakeAction,
} from "@/app/admin/sourcing/actions";
import type { IntakeBatchReport } from "@/lib/sourcing/intake/import";
import type { WorkbookPreviewReport } from "@/lib/sourcing/intake/workbook";

function isWorkbookPreviewReport(
  value: WorkbookPreviewReport | IntakeBatchReport | null
): value is WorkbookPreviewReport {
  return Boolean(value && typeof value === "object" && "detectedFormat" in value && "previewRows" in value);
}

export default function IntakeCsvForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<WorkbookPreviewReport | null>(null);
  const [importReport, setImportReport] = useState<WorkbookPreviewReport | IntakeBatchReport | null>(
    null
  );
  const [fileKey, setFileKey] = useState(0);

  async function onPreview(formData: FormData) {
    setBusy(true);
    setError(null);
    setImportReport(null);
    try {
      const result = await previewWorkbookIntakeAction(formData);
      if (result.error) setError(result.error);
      if (result.report) setPreview(result.report as WorkbookPreviewReport);
      else setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function onImportWorkbook(formData: FormData) {
    setBusy(true);
    setError(null);
    formData.set("confirmImport", "1");
    try {
      const result = await importWorkbookIntakeAction(formData);
      if (result.error) setError(result.error);
      if (result.report) {
        setImportReport(result.report as WorkbookPreviewReport);
        setPreview(result.report as WorkbookPreviewReport);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      setFileKey((k) => k + 1);
    }
  }

  async function onImportCsvPaste(formData: FormData) {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const result = await importCsvIntakeAction(formData);
      if (result.error) setError(result.error);
      if (result.report) setImportReport(result.report as IntakeBatchReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const report = importReport || preview;
  const workbookReport = isWorkbookPreviewReport(report) ? report : null;
  const csvReport = report && !isWorkbookPreviewReport(report) ? report : null;

  return (
    <div className="space-y-6">
      <form action={onPreview} className="space-y-4 border border-neutral-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-semibold text-neutral-800">Source label (optional)</span>
            <input
              name="sourceLabel"
              className="mt-1 w-full border border-neutral-300 px-3 py-2"
              placeholder="Auto-detected from workbook when blank"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-neutral-800">Default source scope (CSV paste only)</span>
            <input
              name="defaultSourceScope"
              defaultValue="staff-csv"
              className="mt-1 w-full border border-neutral-300 px-3 py-2"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-semibold text-neutral-800">
            Upload workbook (.csv / .xls / .xlsx)
          </span>
          <input
            key={fileKey}
            name="workbookFile"
            type="file"
            accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="mt-1 block w-full text-sm"
            required
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Penske pre-auction (Medium Duty) and Hogan wholesale formats are detected by headers — not
            filename. Nothing is saved until you click Import after preview.
          </span>
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 bg-neutral-900 px-6 py-3 text-sm font-semibold uppercase text-white hover:bg-neutral-700 disabled:opacity-60"
          >
            {busy ? "Working…" : "Preview"}
          </button>
        </div>
      </form>

      {preview && !preview.workbookParseError && (
        <form action={onImportWorkbook} className="border border-amber-200 bg-amber-50 p-4 text-sm">
          <input type="hidden" name="confirmImport" value="1" />
          <input type="hidden" name="sourceLabel" value={preview.sourceLabel} />
          <p className="font-semibold text-amber-950">
            Preview ready — re-select the same file to import (nothing persisted yet).
          </p>
          <label className="mt-3 block text-sm">
            <span className="font-semibold">Confirm file for import</span>
            <input
              name="workbookFile"
              type="file"
              accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-1 block w-full text-sm"
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-3 min-h-12 bg-[#fc0527] px-6 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:opacity-60"
          >
            {busy ? "Importing…" : "Import previewed rows"}
          </button>
        </form>
      )}

      <details className="border border-neutral-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Or paste staff CSV (legacy)</summary>
        <form action={onImportCsvPaste} className="mt-3 space-y-3">
          <input type="hidden" name="sourceLabel" value="Staff-reviewed CSV" />
          <input type="hidden" name="defaultSourceScope" value="staff-csv" />
          <textarea
            name="csvText"
            rows={8}
            className="w-full border border-neutral-300 px-3 py-2 font-mono text-xs"
            placeholder="seller,source_scope,source_listing_id,stock_number,listing_url,..."
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 border border-neutral-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            Import pasted CSV
          </button>
        </form>
      </details>

      {error && (
        <div className="border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      )}

      {workbookReport && (
        <div className="border border-neutral-200 bg-white p-6 text-sm space-y-3">
          <h3 className="font-bold">
            {importReport ? "Import report" : "Preview"} — {workbookReport.sourceLabel}
          </h3>
          {workbookReport.workbookParseError && (
            <p className="text-red-800">
              Parse failure ({workbookReport.workbookParseError.code}):{" "}
              {workbookReport.workbookParseError.error}
            </p>
          )}
          <p className="text-neutral-700">
            Detected: <strong>{workbookReport.detectedFormat}</strong>
            {workbookReport.sheetName ? (
              <>
                {" "}
                · sheet <strong>{workbookReport.sheetName}</strong>
              </>
            ) : null}
            {workbookReport.workbookDate ? (
              <>
                {" "}
                · workbook date <strong>{workbookReport.workbookDate}</strong>
              </>
            ) : null}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <li>
              <strong>{workbookReport.usableLeads}</strong> usable rows
            </li>
            <li>
              <strong>{workbookReport.confirmed}</strong> confirmed match
            </li>
            <li>
              <strong>{workbookReport.needsVerification}</strong> needs verification
            </li>
            <li>
              <strong>{workbookReport.rejected}</strong> rejected
            </li>
            <li>
              <strong>{workbookReport.inserted}</strong> new
            </li>
            <li>
              <strong>{workbookReport.listingChanges}</strong> listing changes
            </li>
            <li>
              <strong>{workbookReport.seenAgain}</strong> seen again
            </li>
            <li>
              <strong>{workbookReport.skippedInvalid}</strong> invalid
            </li>
          </ul>

          {workbookReport.previewRows?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Unit</th>
                    <th className="py-2 pr-3">Year / unit</th>
                    <th className="py-2 pr-3">GVW</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Apply</th>
                    <th className="py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {workbookReport.previewRows.slice(0, 100).map((row) => (
                    <tr key={row.rowNumber} className="border-b border-neutral-100 align-top">
                      <td className="py-2 pr-3">{row.rowNumber}</td>
                      <td className="py-2 pr-3 font-mono">{row.unit}</td>
                      <td className="py-2 pr-3">
                        {row.year ?? "—"} {row.makeModel}
                      </td>
                      <td className="py-2 pr-3">
                        {row.gvwLbs != null ? row.gvwLbs.toLocaleString() : "—"}
                      </td>
                      <td className="py-2 pr-3">{row.summary}</td>
                      <td className="py-2 pr-3">{row.applyKind}</td>
                      <td className="py-2 text-neutral-600">{row.reasons.slice(0, 2).join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {workbookReport.previewRows.length > 100 && (
                <p className="mt-2 text-xs text-neutral-500">
                  Showing first 100 of {workbookReport.previewRows.length} rows.
                </p>
              )}
            </div>
          )}

          {workbookReport.errors.length > 0 && (
            <div>
              <p className="font-semibold text-amber-800">Errors</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-900">
                {workbookReport.errors.slice(0, 50).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {csvReport && (
        <div className="border border-neutral-200 bg-white p-6 text-sm space-y-3">
          <h3 className="font-bold">Intake report — {csvReport.sourceLabel}</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <li>
              <strong>{csvReport.usableLeads}</strong> usable leads
            </li>
            <li>
              <strong>{csvReport.inserted}</strong> new
            </li>
            <li>
              <strong>{csvReport.listingChanges}</strong> listing changes
            </li>
            <li>
              <strong>{csvReport.seenAgain}</strong> seen again
            </li>
            <li>
              <strong>{csvReport.skippedInvalid}</strong> skipped invalid
            </li>
            <li>
              <strong>{csvReport.needsVerification}</strong> needs verification
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
