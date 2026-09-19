import { notFound } from "next/navigation";
import MatchStatusBadge from "@/components/admin/sourcing/MatchStatusBadge";
import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import TruckLeadForm from "@/components/admin/sourcing/TruckLeadForm";
import { getSupplierContacts, getTruckLeadById } from "@/lib/sourcing/db";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTruckLeadPage({ params }: PageProps) {
  const { id } = await params;
  const [lead, contacts] = await Promise.all([getTruckLeadById(id), getSupplierContacts()]);
  if (!lead) notFound();

  return (
    <div>
      <SourcingNav active="leads" />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">
            {[lead.year, lead.makeModel].filter(Boolean).join(" ") || "Edit lead"}
          </h2>
          <MatchStatusBadge status={lead.matchStatus} />
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

        <TruckLeadForm lead={lead} contacts={contacts} />
      </div>
    </div>
  );
}
