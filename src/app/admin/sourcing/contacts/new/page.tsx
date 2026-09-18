import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import SupplierContactForm from "@/components/admin/sourcing/SupplierContactForm";

export default function NewSupplierContactPage() {
  return (
    <div>
      <SourcingNav active="contacts" />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
        <h2 className="text-lg font-bold">Add supplier contact</h2>
        <SupplierContactForm />
      </div>
    </div>
  );
}
