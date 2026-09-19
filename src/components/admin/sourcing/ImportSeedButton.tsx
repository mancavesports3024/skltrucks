"use client";

import { useState } from "react";
import { importSeedResearchAction } from "@/app/admin/sourcing/actions";

export default function ImportSeedButton() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await importSeedResearchAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(
        `Seed import complete. Contacts +${result.contactsInserted} (skipped ${result.contactsSkipped}). Leads +${result.leadsInserted} (skipped duplicates ${result.leadsSkipped}). All marked unverified seed research.`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="min-h-11 border border-neutral-300 bg-white px-5 text-sm font-semibold uppercase hover:bg-neutral-50 disabled:opacity-60"
      >
        {busy ? "Importing…" : "Import unverified seed research"}
      </button>
      <p className="text-xs text-neutral-500">
        Loads the attached Sept 18 report as unverified seed. Skips Purple Wave category auction
        rows as individual trucks. Safe to re-run (duplicates skipped).
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {message && <p className="text-sm text-emerald-800">{message}</p>}
    </div>
  );
}
