import { notFound } from "next/navigation";
import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import SupplierContactForm from "@/components/admin/sourcing/SupplierContactForm";
import { getSupplierContactById } from "@/lib/sourcing/db";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSupplierContactPage({ params }: PageProps) {
  const { id } = await params;
  const contact = await getSupplierContactById(id);
  if (!contact) notFound();

  return (
    <div>
      <SourcingNav active="contacts" />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
        <h2 className="text-lg font-bold">{contact.company}</h2>
        {contact.sourceUrl && (
          <a
            href={contact.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[#fc0527] hover:underline"
          >
            Source link →
          </a>
        )}
        <SupplierContactForm contact={contact} />
      </div>
    </div>
  );
}
