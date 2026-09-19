"use client";

import { useState } from "react";
import { runInternetSearchAction } from "@/app/admin/sourcing/actions";
import type { SearchRunReport } from "@/lib/sourcing/search/types";

interface Props {
  liveConfigured: boolean;
  configuredProviderLabel: string;
}

export default function RunSearchButton({ liveConfigured, configuredProviderLabel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SearchRunReport | null>(null);

  async function onRun(forceMock: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await runInternetSearchAction(forceMock);
      if (result.error) setError(result.error);
      if (result.report) setReport(result.report as SearchRunReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || !liveConfigured}
          onClick={() => onRun(false)}
          className="min-h-12 bg-[#fc0527] px-6 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:opacity-50"
        >
          {busy ? "Searching…" : "Run search now"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onRun(true)}
          className="min-h-12 border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold uppercase text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
        >
          Run mock search
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        Live provider when configured: <strong>{configuredProviderLabel}</strong>. Keys stay on the
        server (never sent to the browser). Prefer <code>TAVILY_API_KEY</code>; OpenAI is optional.
        No cron — staff only.
      </p>

      {error && (
        <div className="border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      )}

      {report && <SearchReportPanel report={report} />}
    </div>
  );
}

export function SearchReportPanel({ report }: { report: SearchRunReport }) {
  const usage = report.apiUsage;
  return (
    <div className="space-y-4 border border-neutral-200 bg-white p-6 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Search-run report</h3>
        <span className="text-xs uppercase text-neutral-500">
          {report.status} · {usage.provider}
          {usage.live ? " · live" : " · mock"} ·{" "}
          {usage.provider === "tavily"
            ? `${usage.creditsConsumed} credit${usage.creditsConsumed === 1 ? "" : "s"}`
            : `est. $${usage.estimatedCostUsd.toFixed(4)}`}
        </span>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <strong>{report.resultsExamined}</strong> results examined
        </li>
        <li>
          <strong>{report.newLeadsSaved}</strong> new leads saved
        </li>
        <li>
          <strong>{report.confirmedMatches}</strong> confirmed matches
        </li>
        <li>
          <strong>{report.needsVerification}</strong> needs verification
        </li>
        <li>
          <strong>{report.duplicatesOrRejected}</strong> duplicate/rejected
        </li>
        <li>
          <strong>{report.contactsSaved}</strong> contacts saved
        </li>
      </ul>

      <div>
        <p className="font-semibold">Provider & usage</p>
        <p className="mt-1 text-neutral-700">
          Provider <strong>{usage.provider}</strong>
          {usage.model ? ` · ${usage.model}` : ""} · searches {usage.searchesRun ?? usage.webSearchCalls}
          {usage.extractsRun != null ? ` · extracts ${usage.extractsRun}` : ""} · credits{" "}
          {usage.creditsConsumed} · est. ${usage.estimatedCostUsd.toFixed(4)}
        </p>
      </div>

      <div>
        <p className="font-semibold">Queries executed</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-neutral-700">
          {report.queriesExecuted.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </div>

      <div>
        <p className="font-semibold">Sources searched</p>
        <p className="mt-1 text-neutral-700">
          {report.sourcesSearched.length ? report.sourcesSearched.join(", ") : "—"}
        </p>
      </div>

      {report.errors.length > 0 && (
        <div>
          <p className="font-semibold text-amber-800">Errors / inaccessible</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-900">
            {report.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="font-semibold">Trucks</p>
        <ul className="mt-2 space-y-2">
          {report.trucksSaved.map((t, i) => (
            <li key={`${t.listingUrl}-${i}`} className="border-t border-neutral-100 pt-2">
              <span className="font-medium">
                {t.seller} #{t.stockNumber || "—"}
              </span>{" "}
              <span className="text-xs uppercase text-neutral-500">
                {t.outcome} · {t.matchStatus}
              </span>
              <div>
                <a
                  href={t.listingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#fc0527] hover:underline break-all"
                >
                  {t.listingUrl}
                </a>
              </div>
              {t.reason && <p className="text-xs text-neutral-500">{t.reason}</p>}
            </li>
          ))}
          {report.trucksSaved.length === 0 && (
            <li className="text-neutral-500">No truck candidates.</li>
          )}
        </ul>
      </div>

      <div>
        <p className="font-semibold">Contacts / call routes</p>
        <ul className="mt-2 space-y-2">
          {report.contactsFound.map((c, i) => (
            <li key={`${c.company}-${i}`} className="border-t border-neutral-100 pt-2">
              <span className="font-medium">{c.company}</span>{" "}
              <span className="text-xs uppercase text-neutral-500">{c.outcome}</span>
              <p className="text-neutral-700">
                {c.phone || "no phone"}
                {c.contactName ? ` · ${c.contactName}` : ""}
              </p>
              {c.sourceUrl && (
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#fc0527] hover:underline"
                >
                  Source
                </a>
              )}
              {c.reason && <p className="text-xs text-neutral-500">{c.reason}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
