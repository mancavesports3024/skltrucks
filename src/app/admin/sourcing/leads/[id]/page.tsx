import { notFound } from "next/navigation";
import MarketComparisonClient from "@/components/admin/sourcing/MarketComparisonClient";
import MatchStatusBadge from "@/components/admin/sourcing/MatchStatusBadge";
import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import TruckLeadForm from "@/components/admin/sourcing/TruckLeadForm";
import {
  getBuyingProfile,
  getSupplierContacts,
  getTruckLeadById,
  listMarketComparisonsForLead,
} from "@/lib/sourcing/db";
import { parseDrivingRouteCache } from "@/lib/sourcing/distance/google-routes";
import {
  leadToComparisonSnapshot,
  missingPreferredLeadFields,
  missingRequiredLeadFields,
  isLeadEligibleForMarketComparison,
} from "@/lib/sourcing/market-comparison/eligibility";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTruckLeadPage({ params }: PageProps) {
  const { id } = await params;
  const [lead, contacts, comparisons, profile] = await Promise.all([
    getTruckLeadById(id),
    getSupplierContacts(),
    listMarketComparisonsForLead(id),
    getBuyingProfile(),
  ]);
  if (!lead) notFound();

  const snapshot = leadToComparisonSnapshot(lead);
  const missingRequired = missingRequiredLeadFields(snapshot);
  const missingPreferred = missingPreferredLeadFields(snapshot);
  const eligible = isLeadEligibleForMarketComparison(snapshot);
  const latest = comparisons.find((c) => c.status === "completed" && c.report) ?? null;
  const drivingRouteCache = parseDrivingRouteCache(lead.specEvidence?.drivingRoute);

  return (
    <div>
      <SourcingNav active="leads" />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">
            {[lead.year, lead.makeModel].filter(Boolean).join(" ") || "Edit lead"}
          </h2>
          <MatchStatusBadge status={lead.matchStatus} />
          {(lead.sourceUrl || lead.canonicalListingUrl) && (
            <a
              href={(lead.sourceUrl || lead.canonicalListingUrl).trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-[#fc0527] underline"
            >
              View listing
            </a>
          )}
          {lead.specEvidence?.inspectionUrl?.trim() ? (
            <a
              href={lead.specEvidence.inspectionUrl.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-[#fc0527] underline"
            >
              View inspection report
            </a>
          ) : null}
        </div>

        {lead.matchReasons.length > 0 && (
          <ul className="border border-neutral-200 bg-white p-4 text-sm space-y-1">
            {lead.matchReasons.map((r) => (
              <li key={r.code}>
                <span className="font-semibold">{r.code}:</span> {r.label}
              </li>
            ))}
          </ul>
        )}

        {lead.researchUncertaintyLabels.length > 0 && (
          <p className="text-sm text-amber-800">
            Uncertainty: {lead.researchUncertaintyLabels.join(" · ")}
          </p>
        )}

        <MarketComparisonClient
          leadId={lead.id}
          eligible={eligible}
          missingRequired={missingRequired}
          missingPreferred={missingPreferred}
          latest={latest}
          drivingRouteCache={drivingRouteCache}
          straightLineMiles={lead.drivingDistanceMiles}
          distanceIsEstimate={lead.distanceIsEstimate}
          transportationRatePerMile={profile.transportationRatePerMile}
          defaultInspectionCost={profile.defaultInspectionCost}
        />

        <TruckLeadForm lead={lead} contacts={contacts} />
      </div>
    </div>
  );
}
