import Link from "next/link";
import MatchStatusBadge from "@/components/admin/sourcing/MatchStatusBadge";
import { formatLeadMileage, formatLeadYear } from "@/lib/sourcing/format-lead-display";
import type { TruckLead } from "@/types/sourcing";

function LeadSubmeta({ lead }: { lead: TruckLead }) {
  const listingUrl = (lead.sourceUrl || lead.canonicalListingUrl || "").trim();
  const inspectionUrl = (lead.specEvidence?.inspectionUrl || "").trim();
  return (
    <div className="space-y-1 text-xs text-neutral-500">
      <div>
        {lead.stockNumber && <span>#{lead.stockNumber} · </span>}
        {lead.boxLengthFt != null ? `${lead.boxLengthFt}' box` : lead.boxLengthRaw || "box ?"}
        {lead.isSeedResearch && <span className="ml-2 text-amber-700">seed</span>}
        {lead.seedSource?.includes("CSV") && <span className="ml-2 text-sky-700">intake</span>}
      </div>
      {(listingUrl || inspectionUrl) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {listingUrl ? (
            <a
              href={listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#fc0527] underline"
            >
              View listing
            </a>
          ) : null}
          {inspectionUrl ? (
            <a
              href={inspectionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#fc0527] underline"
            >
              View inspection report
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function TruckLeadsList({ leads }: { leads: TruckLead[] }) {
  return (
    <>
      <ul className="space-y-3 md:hidden" data-testid="truck-leads-mobile">
        {leads.map((lead) => (
          <li key={lead.id} className="border border-neutral-200 bg-white p-4">
            <Link
              href={`/admin/sourcing/leads/${lead.id}`}
              className="font-semibold text-neutral-900 hover:text-[#fc0527]"
            >
              {lead.makeModel || "Untitled lead"}
            </Link>
            <p className="mt-1 text-sm text-neutral-700">
              Year {formatLeadYear(lead.year)} · {formatLeadMileage(lead.mileage)}
            </p>
            <LeadSubmeta lead={lead} />
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span>{lead.seller || "—"}</span>
              <MatchStatusBadge status={lead.matchStatus} />
              <span>{lead.price != null ? `$${lead.price.toLocaleString()}` : "—"}</span>
              <span>
                {lead.drivingDistanceMiles != null
                  ? lead.distanceIsEstimate
                    ? `~${lead.drivingDistanceMiles} mi straight-line`
                    : `~${lead.drivingDistanceMiles} mi`
                  : "distance unknown"}
              </span>
              <span className="text-neutral-500">{lead.dateLastChecked || "—"}</span>
            </div>
          </li>
        ))}
        {leads.length === 0 && (
          <li className="border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-500">
            No leads yet. Add one or import unverified seed research from Overview.
          </li>
        )}
      </ul>

      <div
        className="hidden overflow-x-auto border border-neutral-200 bg-white md:block"
        data-testid="truck-leads-desktop"
      >
        <table className="min-w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Truck</th>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Mileage</th>
              <th className="px-4 py-3">Seller</th>
              <th className="px-4 py-3">Match</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Straight-line mi</th>
              <th className="px-4 py-3">Checked</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/sourcing/leads/${lead.id}`}
                    className="font-semibold text-neutral-900 hover:text-[#fc0527]"
                  >
                    {lead.makeModel || "Untitled lead"}
                  </Link>
                  <LeadSubmeta lead={lead} />
                </td>
                <td className="px-4 py-3 tabular-nums">{formatLeadYear(lead.year)}</td>
                <td className="px-4 py-3 tabular-nums">{formatLeadMileage(lead.mileage)}</td>
                <td className="px-4 py-3">{lead.seller || "—"}</td>
                <td className="px-4 py-3">
                  <MatchStatusBadge status={lead.matchStatus} />
                </td>
                <td className="px-4 py-3">
                  {lead.price != null ? `$${lead.price.toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3">
                  {lead.drivingDistanceMiles != null
                    ? lead.distanceIsEstimate
                      ? `~${lead.drivingDistanceMiles} mi est. straight-line`
                      : `~${lead.drivingDistanceMiles} mi`
                    : "unknown"}
                </td>
                <td className="px-4 py-3">{lead.dateLastChecked || "—"}</td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                  No leads yet. Add one or import unverified seed research from Overview.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
