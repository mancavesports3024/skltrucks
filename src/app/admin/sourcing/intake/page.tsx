import IntakeCsvForm from "@/components/admin/sourcing/IntakeCsvForm";
import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import { requireSourcingStaff } from "@/lib/sourcing/access";
import { getBuyingProfile } from "@/lib/sourcing/db";
import { INTAKE_SOURCES } from "@/lib/sourcing/intake/sources";

export default async function SourcingIntakePage() {
  const access = await requireSourcingStaff();
  if (!access.ok) {
    return (
      <div>
        <SourcingNav active="intake" />
        <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-red-800">{access.error}</div>
      </div>
    );
  }

  const profile = await getBuyingProfile();

  return (
    <div>
      <SourcingNav active="intake" />
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:py-8">
        <div>
          <h2 className="text-lg font-bold">Listing intake (nonprod pilot)</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Staff-reviewed CSV import for listings obtained via a permitted channel (dealer email,
            CSV export, or agreed feed). Public search pages are not treated as daily feeds. No
            scraping, scheduled job, or email send in this pass. Source notes:{" "}
            <code className="text-xs">docs/sourcing-intake-sources.md</code>.
          </p>
        </div>

        <section className="border border-neutral-200 bg-white p-6 space-y-4">
          <h3 className="font-bold">Recurring sources — access status</h3>
          <ul className="space-y-4 text-sm">
            {INTAKE_SOURCES.filter((s) => s.id !== "staff-reviewed-csv").map((source) => (
              <li key={source.id} className="border-t border-neutral-100 pt-4 first:border-0 first:pt-0">
                <p className="font-semibold">{source.name}</p>
                <p className="mt-1 text-neutral-600">{source.summary}</p>
                <ul className="mt-2 space-y-1 text-neutral-700">
                  {source.accessMethods.map((m) => (
                    <li key={`${source.id}-${m.method}`}>
                      <span className={m.available ? "text-emerald-700" : "text-neutral-500"}>
                        {m.available ? "Available" : "Not ready"}
                      </span>
                      {" · "}
                      <span className="font-mono text-xs">{m.method}</span> — {m.notes}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-amber-800">
                  Automation ready: {source.automationReady ? "yes" : "no — use staff CSV until authorized"}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="font-bold">Import CSV / Excel</h3>
          <p className="text-sm text-neutral-600">
            Accepts <code className="text-xs">.csv</code>, <code className="text-xs">.xls</code>, and{" "}
            <code className="text-xs">.xlsx</code>. Staff template columns (aliases accepted):{" "}
            <code className="text-xs">seller</code>, <code className="text-xs">source_scope</code>,{" "}
            <code className="text-xs">source_listing_id</code> or <code className="text-xs">stock_number</code>,{" "}
            <code className="text-xs">listing_url</code>. Penske Used Trucks downloads map automatically (
            <code className="text-xs">Unit</code> → stock, synthetic unit URL, engine/trans/GVW evidence).
            Penske Excel has no load length — check the box-length filter attestation when you already
            filtered to {profile.requiredBoxLengthsFt.join("/")}′. Include evidence columns (
            <code className="text-xs">engine_evidence</code>,{" "}
            <code className="text-xs">transmission_evidence</code>,{" "}
            <code className="text-xs">box_length_evidence</code>,{" "}
            <code className="text-xs">gvwr_evidence</code>) on hand-built CSVs or those specs stay Needs
            verification.
          </p>
          <IntakeCsvForm allowedBoxLengthsFt={profile.requiredBoxLengthsFt} />
        </section>
      </div>
    </div>
  );
}
