import Link from "next/link";
import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import TruckLeadsList from "@/components/admin/sourcing/TruckLeadsList";
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

        <TruckLeadsList leads={filtered} />
      </div>
    </div>
  );
}
