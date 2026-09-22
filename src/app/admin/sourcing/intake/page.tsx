import IntakeCsvForm from "@/components/admin/sourcing/IntakeCsvForm";
import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import { requireSourcingStaff } from "@/lib/sourcing/access";
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

  return (
    <div>
      <SourcingNav active="intake" />
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:py-8">
        <div>
          <h2 className="text-lg font-bold">Listing intake (staff-reviewed)</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Upload authorized dealer workbooks (.csv / .xls / .xlsx). Preview classifies rows; nothing
            is persisted until Import. Penske pre-auction uses the Medium Duty sheet only; Hogan
            wholesale uses Unit # identity. No scraping, cron, email, or OpenAI parsing. GVWR rule: ≤
            26,000 lb accepted; ≥ 26,001 lb rejected. Source notes:{" "}
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
                  Automation ready: {source.automationReady ? "yes" : "no — use staff upload until authorized"}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="font-bold">Preview &amp; import workbook</h3>
          <IntakeCsvForm />
        </section>
      </div>
    </div>
  );
}