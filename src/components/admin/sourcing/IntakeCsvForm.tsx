"use client";

import { useState } from "react";
import { importCsvIntakeAction } from "@/app/admin/sourcing/actions";
import type { IntakeBatchReport } from "@/lib/sourcing/intake/import";

interface IntakeCsvFormProps {
  defaultSourceScope?: string;
  defaultSourceLabel?: string;
}

export default function IntakeCsvForm({
  defaultSourceScope = "staff-csv",
  defaultSourceLabel = "Staff-reviewed CSV (pilot)",
}: IntakeCsvFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<IntakeBatchReport | null>(null);

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const result = await importCsvIntakeAction(formData);
      if (result.error) setError(result.error);
      if (result.report) setReport(result.report as IntakeBatchReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form action={onSubmit} className="space-y-4 border border-neutral-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-semibold text-neutral-800">Source label</span>
            <input
              name="sourceLabel"
              defaultValue={defaultSourceLabel}
              className="mt-1 w-full border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-neutral-800">Default source scope</span>
            <input
              name="defaultSourceScope"
              defaultValue={defaultSourceScope}
              className="mt-1 w-full border border-neutral-300 px-3 py-2"
              placeholder="e.g. penske-used-trucks"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-semibold text-neutral-800">Upload CSV / Excel file</span>
          <input
            name="csvFile"
            type="file"
            accept=".csv,.xls,.xlsx,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="mt-1 block w-full text-sm"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Penske Used Trucks Excel/CSV exports can be uploaded as downloaded — no column remapping needed.
          </span>
        </label>

        <label className="block text-sm">
          <span className="font-semibold text-neutral-800">Or paste CSV</span>
          <textarea
            name="csvText"
            rows={12}
            className="mt-1 w-full border border-neutral-300 px-3 py-2 font-mono text-xs"
            placeholder="seller,source_scope,source_listing_id,stock_number,listing_url,vin,year,make_model,..."
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="min-h-12 bg-[#fc0527] px-6 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:opacity-60"
        >
          {busy ? "Importing…" : "Import staff-reviewed file"}
        </button>
      </form>

      {error && (
        <div className="border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      )}

      {report && (
        <div className="border border-neutral-200 bg-white p-6 text-sm space-y-3">
          <h3 className="font-bold">Intake report — {report.sourceLabel}</h3>
          {report.parseError && (
            <p className="text-red-800">
              Source/parse failure ({report.parseError.code}): {report.parseError.error}
            </p>
          )}
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <li>
              <strong>{report.usableLeads}</strong> usable leads
            </li>
            <li>
              <strong>{report.inserted}</strong> new
            </li>
            <li>
              <strong>{report.listingChanges}</strong> listing changes
            </li>
            <li>
              <strong>{report.seenAgain}</strong> seen again
            </li>
            <li>
              <strong>{report.skippedInvalid}</strong> skipped invalid
            </li>
            <li>
              <strong>{report.needsVerification}</strong> needs verification
            </li>
          </ul>
          {report.staffMustVerify.length > 0 && (
            <div>
              <p className="font-semibold">Staff still must verify:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-neutral-700">
                {report.staffMustVerify.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {report.errors.length > 0 && (
            <div>
              <p className="font-semibold text-amber-800">Errors</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-900">
                {report.errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
