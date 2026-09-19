import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import TruckLeadForm from "@/components/admin/sourcing/TruckLeadForm";
import { getSupplierContacts } from "@/lib/sourcing/db";

export default async function NewTruckLeadPage() {
  const contacts = await getSupplierContacts();

  return (
    <div>
      <SourcingNav active="leads" />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
        <h2 className="text-lg font-bold">Add truck lead</h2>
        <p className="text-sm text-neutral-600">
          Leave driving distance blank when unknown — the matcher will not invent a distance. Mark
          listed weight as GVW when the listing does not say GVWR.
        </p>
        <TruckLeadForm contacts={contacts} />
      </div>
    </div>
  );
}
