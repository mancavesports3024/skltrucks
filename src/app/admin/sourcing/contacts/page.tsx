import Link from "next/link";
import SourcingNav from "@/components/admin/sourcing/SourcingNav";
import { getSupplierContacts } from "@/lib/sourcing/db";

export default async function SourcingContactsPage() {
  const contacts = await getSupplierContacts();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <SourcingNav active="contacts" />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Supplier contacts</h2>
            <p className="text-sm text-neutral-600">{contacts.length} contacts</p>
          </div>
          <Link
            href="/admin/sourcing/contacts/new"
            className="flex min-h-12 items-center justify-center bg-[#fc0527] px-6 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422]"
          >
            + Add contact
          </Link>
        </div>

        <div className="overflow-x-auto border border-neutral-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Last contact</th>
                <th className="px-4 py-3">Next follow-up</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const overdue =
                  c.nextFollowUpDate && c.nextFollowUpDate < today ? "text-red-700 font-semibold" : "";
                return (
                  <tr key={c.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/sourcing/contacts/${c.id}`}
                        className="font-semibold hover:text-[#fc0527]"
                      >
                        {c.company}
                      </Link>
                      {c.contactName && (
                        <div className="text-xs text-neutral-500">{c.contactName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.phone || "—"}
                      {c.phoneVerified && (
                        <span className="ml-1 text-xs text-emerald-700">verified</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{c.supplierType || "—"}</td>
                    <td className="px-4 py-3">{c.lastContactDate || "—"}</td>
                    <td className={`px-4 py-3 ${overdue}`}>{c.nextFollowUpDate || "—"}</td>
                  </tr>
                );
              })}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                    No supplier contacts yet.
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
