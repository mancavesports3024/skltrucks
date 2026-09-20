"use client";

import { useMemo, useState } from "react";
import { runPenskeUrlInspectionAction } from "@/app/admin/sourcing/actions";
import { SearchReportPanel } from "@/components/admin/sourcing/RunSearchButton";
import {
  estimatePenskeInspectionMaxCostUsd,
  PENSKE_URL_INSPECTION_MAX_URLS,
  parseAndValidatePenskeUnitUrls,
} from "@/lib/sourcing/search/penske-url-inspection";
import type { SearchRunReport } from "@/lib/sourcing/search/types";

interface Props {
  enabled: boolean;
}

export default function PenskeUrlInspectionPanel({ enabled }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SearchRunReport | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const preview = useMemo(() => {
    const parsed = parseAndValidatePenskeUnitUrls(text);
    if (!parsed.ok) {
      return { ok: false as const, error: parsed.error, count: 0, maxCost: 0 };
    }
    return {
      ok: true as const,
      count: parsed.urls.length,
      maxCost: estimatePenskeInspectionMaxCostUsd(parsed.urls.length),
      urls: parsed.urls,
    };
  }, [text]);

  if (!enabled) return null;

  async function onRun() {
    if (!confirmed) {
      setError("Confirm the estimated maximum cost before running.");
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const result = await runPenskeUrlInspectionAction(text);
      if (result.error) setError(result.error);
      if (result.report) setReport(result.report as SearchRunReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Penske inspection failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 border border-neutral-200 bg-white p-6">
      <div>
        <h3 className="font-bold">Inspect Penske listings</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Paste <strong>1–{PENSKE_URL_INSPECTION_MAX_URLS}</strong> individual public Penske unit
          URLs (one per line). Category pages, <code className="text-xs">search-inventory</code>{" "}
          hubs, and SPA search URLs are <strong>not</strong> supported. Excel intake remains the
          approved bulk workflow.
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Production enablement requires written Penske authorization. No cookies, API client IDs,
          or session replay.
        </p>
      </div>

      <label className="block text-sm">
        <span className="font-semibold text-neutral-800">Penske unit URLs</span>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setConfirmed(false);
          }}
          rows={8}
          className="mt-1 w-full border border-neutral-300 px-3 py-2 font-mono text-xs"
          placeholder={
            "https://www.penskeusedtrucks.com/truck-types/.../unit-228474/\nhttps://www.penskeusedtrucks.com/truck-types/.../unit-416704/"
          }
        />
      </label>

      <div className="text-sm text-neutral-700">
        {preview.ok ? (
          <p>
            <strong>{preview.count}</strong> unique unit URL
            {preview.count === 1 ? "" : "s"} · estimated maximum cost{" "}
            <strong>${preview.maxCost.toFixed(2)}</strong> (assumes one web_search per URL + token
            ceiling; actual may be lower)
          </p>
        ) : text.trim() ? (
          <p className="text-amber-900">{preview.error}</p>
        ) : (
          <p className="text-neutral-500">
            Limit {PENSKE_URL_INSPECTION_MAX_URLS} unique URLs. Inspect-only — no open-web discovery.
          </p>
        )}
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={confirmed}
          disabled={!preview.ok || busy}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          I confirm these are public individual unit pages I selected, and I accept up to{" "}
          <strong>${preview.ok ? preview.maxCost.toFixed(2) : "—"}</strong> estimated maximum cost
          for this run.
        </span>
      </label>

      <button
        type="button"
        disabled={busy || !preview.ok || !confirmed}
        onClick={() => onRun()}
        className="min-h-12 bg-[#fc0527] px-6 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:opacity-50"
      >
        {busy ? "Inspecting…" : "Run Penske inspection"}
      </button>

      {error && (
        <div className="border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      )}
      {report && <SearchReportPanel report={report} />}
    </section>
  );
}
