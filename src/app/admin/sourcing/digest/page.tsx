import Link from "next/link";
import MatchStatusBadge from "@/components/admin/sourcing/MatchStatusBadge";
import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import { requireSourcingStaff } from "@/lib/sourcing/access";
import { buildDailyDigestPreview } from "@/lib/sourcing/digest";
import { getTruckLeads } from "@/lib/sourcing/db";

export default async function SourcingDigestPage() {
  const access = await requireSourcingStaff();
  if (!access.ok) {
    return (
      <div>
        <SourcingNav active="digest" />
        <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-red-800">{access.error}</div>
      </div>
    );
  }

  const leads = await getTruckLeads();
  const digest = buildDailyDigestPreview(leads);

  return (
    <div>
      <SourcingNav active="digest" />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
        <div>
          <h2 className="text-lg font-bold">Daily digest preview</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Newly discovered listings and meaningful listing-field changes in the last 24 hours.
            Recording a call, editing notes, or recalculating matches does not surface a lead here.
            Email is not scheduled or sent in this pass.
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Window: {new Date(digest.windowStart).toLocaleString()} →{" "}
            {new Date(digest.windowEnd).toLocaleString()} · {digest.total} event(s) (
            {digest.newListingCount} new · {digest.listingChangeCount} listing change
            {digest.listingChangeCount === 1 ? "" : "s"})
          </p>
        </div>

        {digest.groups.length === 0 && (
          <div className="border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            No new listings or listing changes in the last 24 hours.
          </div>
        )}

        {digest.groups.map((group) => (
          <section key={group.status} className="border border-neutral-200 bg-white p-6">
            <div className="mb-4 flex items-center gap-3">
              <MatchStatusBadge status={group.status} />
              <span className="text-sm text-neutral-500">{group.entries.length}</span>
            </div>
            <ul className="space-y-3">
              {group.entries.map(({ lead, kind, at }) => (
                <li
                  key={`${lead.id}-${kind}-${at}`}
                  className="border-t border-neutral-100 pt-3 first:border-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/sourcing/leads/${lead.id}`}
                      className="font-semibold hover:text-[#fc0527]"
                    >
                      {[lead.year, lead.makeModel].filter(Boolean).join(" ") || "Lead"}
                    </Link>
                    <span className="border border-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-600">
                      {kind === "new_listing" ? "New listing" : "Listing change"}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-600">
                    {lead.seller}
                    {lead.price != null ? ` · $${lead.price.toLocaleString()}` : ""}
                    {lead.location ? ` · ${lead.location}` : ""}
                  </p>
                  {lead.sourceUrl && (
                    <a
                      href={lead.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#fc0527] hover:underline"
                    >
                      Source
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <div className="border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
          <strong>Still needed for email delivery:</strong> a scheduled job (e.g. Vercel Cron),
          digest recipient list, and a call into the existing Gmail/Nodemailer helper — intentionally
          not wired in this pass.
        </div>
      </div>
    </div>
  );
}
