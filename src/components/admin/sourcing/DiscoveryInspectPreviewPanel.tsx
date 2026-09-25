"use client";

import { useMemo, useState } from "react";
import {
  importDiscoveryInspectSelectedAction,
  runDiscoveryInspectPreviewAction,
} from "@/app/admin/sourcing/actions";
import {
  DISCOVERY_INSPECT_CONFIRM_FIELD,
  DISCOVERY_INSPECT_CONFIRM_VALUE,
} from "@/lib/sourcing/search/discovery-inspect/types";
import {
  DEFAULT_DISCOVERY_INSPECT_CEILINGS,
  estimateDiscoveryInspectCombinedMaxCostUsd,
} from "@/lib/sourcing/search/discovery/ceilings";
import type { DiscoveryInspectPreviewReport } from "@/lib/sourcing/search/discovery-inspect/types";

interface Props {
  tavilyConfigured: boolean;
  openAiConfigured: boolean;
}

export default function DiscoveryInspectPreviewPanel({
  tavilyConfigured,
  openAiConfigured,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<DiscoveryInspectPreviewReport | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [importReport, setImportReport] = useState<string | null>(null);

  const costs = useMemo(
    () => estimateDiscoveryInspectCombinedMaxCostUsd(DEFAULT_DISCOVERY_INSPECT_CEILINGS),
    []
  );

  async function onPreview(forceMock: boolean) {
    if (!forceMock && !confirmed) {
      setError("Confirm paid-provider use before running live Preview.");
      return;
    }
    setBusy(true);
    setError(null);
    setImportReport(null);
    setPreview(null);
    setSelected({});
    try {
      const fd = new FormData();
      if (!forceMock) {
        fd.set(DISCOVERY_INSPECT_CONFIRM_FIELD, DISCOVERY_INSPECT_CONFIRM_VALUE);
      }
      fd.set("forceMock", forceMock ? "1" : "0");
      const result = await runDiscoveryInspectPreviewAction(fd);
      if (result.error) setError(result.error);
      if (result.preview) {
        setPreview(result.preview as DiscoveryInspectPreviewReport);
        const initial: Record<string, boolean> = {};
        for (const row of result.preview.rows) {
          if (row.importEligible) initial[row.id] = true;
        }
        setSelected(initial);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (!preview) return;
    const selectedUrls = preview.rows
      .filter((r) => selected[r.id])
      .map((r) => r.canonicalUrl || r.finalUrl)
      .filter(Boolean);
    if (selectedUrls.length === 0) {
      setError("Select at least one listing URL.");
      return;
    }
    setBusy(true);
    setError(null);
    setImportReport(null);
    try {
      // Server revalidates URLs — never send truck/evidence/classification payload.
      const result = await importDiscoveryInspectSelectedAction({ selectedUrls });
      if (result.error) setError(result.error);
      if (result.report) {
        setImportReport(
          `Imported ${result.importedCount ?? result.report.newLeadsSaved} lead(s). Confirmed ${result.report.confirmedMatches}, needs verification ${result.report.needsVerification}, duplicate/rejected ${result.report.duplicatesOrRejected}. Import made zero Tavily/OpenAI calls.`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 border border-neutral-200 bg-white p-6 text-sm">
      <div>
        <h3 className="font-bold">Tavily Discovery → Inspection Preview</h3>
        <p className="mt-1 text-neutral-600">
          Manual staff mode: discover unit URLs with Tavily basic search, validate pages, inspect a
          capped set, then preview. Nothing is saved until you click{" "}
          <strong>Import selected leads</strong>. No cron, no email, no Tavily extract.
        </p>
      </div>

      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
        <p className="font-semibold">Cost confirmation (server-enforced ceilings)</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Max Tavily queries/credits: {DEFAULT_DISCOVERY_INSPECT_CEILINGS.maxTavilyCredits}</li>
          <li>
            Max validated candidates inspected:{" "}
            {DEFAULT_DISCOVERY_INSPECT_CEILINGS.maxInspectCandidates}
          </li>
          <li>
            Max OpenAI exact-URL inspection calls:{" "}
            {DEFAULT_DISCOVERY_INSPECT_CEILINGS.maxOpenAiInspectCalls} (no OpenAI discovery)
          </li>
          <li>
            Est. worst-case: Tavily ${costs.tavilyMaxUsd.toFixed(2)} + OpenAI $
            {costs.openAiMaxUsd.toFixed(2)} = <strong>${costs.combinedMaxUsd.toFixed(2)}</strong>
          </li>
        </ul>
        <label className="mt-2 flex items-start gap-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I confirm paid-provider use for a live Preview (Tavily discovery
            {openAiConfigured ? " + optional OpenAI page inspection" : ""}). Keys stay on the
            server.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || !tavilyConfigured || !confirmed}
          onClick={() => onPreview(false)}
          className="min-h-12 bg-[#fc0527] px-6 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:opacity-50"
        >
          {busy ? "Running…" : "Run Discovery Preview"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onPreview(true)}
          className="min-h-12 border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold uppercase text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
        >
          Run mock Preview
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        Tavily: {tavilyConfigured ? "configured" : "missing"} · OpenAI inspect:{" "}
        {openAiConfigured ? "configured" : "missing (deterministic HTML only)"}
      </p>

      {error && (
        <div className="border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      )}
      {importReport && (
        <div className="border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          {importReport}
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div>
              <strong>{preview.tavilyCredits}</strong> Tavily credits · $
              {preview.tavilyEstimatedCostUsd.toFixed(4)}
            </div>
            <div>
              <strong>{preview.openAiInspectCalls}</strong> OpenAI inspect calls · $
              {preview.openAiEstimatedCostUsd.toFixed(4)}
            </div>
            <div>
              Combined est. <strong>${preview.combinedEstimatedCostUsd.toFixed(4)}</strong>
            </div>
            <div>
              Retained <strong>{preview.retained.length}</strong> · Rejected pre-inspect{" "}
              <strong>{preview.rejectedBeforeInspect.length}</strong>
            </div>
            <div>
              Inspected <strong>{preview.validated.length}</strong> · DB writes{" "}
              <strong>{String(preview.dbWrites)}</strong>
            </div>
            <div>
              Mode <strong>{preview.mode}</strong> · previewId {preview.previewId.slice(0, 8)}…
            </div>
          </div>

          <div>
            <p className="font-semibold">Discovery queries</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-neutral-700">
              {preview.queryPlans.map((q) => (
                <li key={q.id}>
                  <span className="text-neutral-500">[{q.id}]</span> {q.query}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-semibold">Preview rows</p>
            <ul className="mt-2 space-y-3">
              {preview.rows.map((row) => (
                <li key={row.id} className="border-t border-neutral-100 pt-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={!row.importEligible || busy}
                      checked={Boolean(selected[row.id])}
                      onChange={(e) =>
                        setSelected((s) => ({ ...s, [row.id]: e.target.checked }))
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2 text-xs uppercase text-neutral-500">
                        <span>{row.previewOutcome}</span>
                        <span>{row.matchStatus}</span>
                        {!row.importEligible && <span>not importable</span>}
                      </div>
                      <p className="font-medium">{row.title || row.truck?.makeModel || "—"}</p>
                      <a
                        href={row.finalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-xs text-[#fc0527] hover:underline"
                      >
                        {row.finalUrl}
                      </a>
                      {row.validationReason && (
                        <p className="text-xs text-neutral-500">
                          Validation: {row.validationReason}
                        </p>
                      )}
                      {row.reasons.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          <p className="text-xs font-semibold text-neutral-600">
                            {row.previewOutcome === "needs_verification"
                              ? "Why Needs verification (all match reasons)"
                              : "Match / outcome reasons"}
                          </p>
                          <ul className="list-disc space-y-0.5 pl-4 text-xs text-neutral-600">
                            {row.reasons.map((reason, idx) => (
                              <li key={`${row.id}-reason-${idx}`}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {row.truck && (
                        <p className="text-xs text-neutral-600">
                          VIN {row.truck.vin || "—"} · stock {row.truck.stockNumber || "—"} ·{" "}
                          {row.truck.phone || "no phone"}
                        </p>
                      )}
                    </div>
                  </label>
                </li>
              ))}
              {preview.rows.length === 0 && (
                <li className="text-neutral-500">No retained candidates.</li>
              )}
            </ul>
          </div>

          <button
            type="button"
            disabled={busy || !preview.rows.some((r) => r.importEligible && selected[r.id])}
            onClick={onImport}
            className="min-h-12 border border-[#fc0527] bg-white px-6 py-3 text-sm font-semibold uppercase text-[#fc0527] hover:bg-red-50 disabled:opacity-50"
          >
            Import selected leads
          </button>
        </div>
      )}
    </section>
  );
}
