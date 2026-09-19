import Link from "next/link";
import MatchStatusBadge from "@/components/admin/sourcing/MatchStatusBadge";
import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import { getTruckLeads } from "@/lib/sourcing/db";
import { MATCH_STATUS_LABELS, type MatchStatus } from "@/types/sourcing";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function SourcingLeadsPage({ searchParams }: PageProps) {
  const { status: statusParam } = await searchParams;
  const leads = await getTruckLeads();
  const statusFilter =
    statusParam && statusParam in MATCH_STATUS_LABELS
      ? (statusParam as MatchStatus)
      : null;
  const filtered = statusFilter
    ? leads.filter((l) => l.matchStatus === statusFilter)
    : leads;

  return (
    <div>
      <SourcingNav active="leads" />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Truck leads</h2>
            <p className="text-sm text-neutral-600">
              {filtered.length} shown
              {statusFilter ? ` · ${MATCH_STATUS_LABELS[statusFilter]}` : ""}
            </p>
          </div>
          <Link
            href="/admin/sourcing/leads/new"
            className="flex min-h-12 items-center justify-center bg-[#fc0527] px-6 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422]"
          >
            + Add lead
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <Link
            href="/admin/sourcing/leads"
            className={`border px-3 py-1.5 ${!statusFilter ? "border-[#fc0527] text-[#fc0527]" : "border-neutral-200"}`}
          >
            All
          </Link>
          {(Object.keys(MATCH_STATUS_LABELS) as MatchStatus[]).map((s) => (
            <Link
              key={s}
              href={`/admin/sourcing/leads?status=${s}`}
              className={`border px-3 py-1.5 ${statusFilter === s ? "border-[#fc0527] text-[#fc0527]" : "border-neutral-200"}`}
            >
              {MATCH_STATUS_LABELS[s]}
            </Link>
          ))}
        </div>

        <div className="overflow-x-auto border border-neutral-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">Truck</th>
                <th className="px-4 py-3">Seller</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Distance</th>
                <th className="px-4 py-3">Checked</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/sourcing/leads/${lead.id}`}
                      className="font-semibold text-neutral-900 hover:text-[#fc0527]"
                    >
                      {[lead.year, lead.makeModel].filter(Boolean).join(" ") || "Untitled lead"}
                    </Link>
                    <div className="text-xs text-neutral-500">
                      {lead.stockNumber && <span>#{lead.stockNumber} · </span>}
                      {lead.boxLengthFt != null ? `${lead.boxLengthFt}' box` : lead.boxLengthRaw || "box ?"}
                      {lead.isSeedResearch && (
                        <span className="ml-2 text-amber-700">seed</span>
                      )}
                      {lead.seedSource?.includes("CSV") && (
                        <span className="ml-2 text-sky-700">intake</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{lead.seller || "—"}</td>
                  <td className="px-4 py-3">
                    <MatchStatusBadge status={lead.matchStatus} />
                  </td>
                  <td className="px-4 py-3">
                    {lead.price != null ? `$${lead.price.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {lead.drivingDistanceMiles != null
                      ? `~${lead.drivingDistanceMiles} mi`
                      : "unknown"}
                  </td>
                  <td className="px-4 py-3">{lead.dateLastChecked || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                    No leads yet. Add one or import unverified seed research from Overview.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
