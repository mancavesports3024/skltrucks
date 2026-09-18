"use client";

import { useState } from "react";
import {
  deleteSupplierContactAction,
  recordSupplierCallAction,
  saveSupplierContactAction,
} from "@/app/admin/sourcing/actions";
import type { SupplierContact } from "@/types/sourcing";

const inputClass =
  "w-full min-h-11 border border-neutral-300 px-4 py-2.5 text-base sm:text-sm focus:border-[#fc0527] focus:outline-none focus:ring-1 focus:ring-[#fc0527]";
const labelClass = "block text-sm font-semibold mb-1";

export default function SupplierContactForm({ contact }: { contact?: SupplierContact }) {
  const [error, setError] = useState("");
  const [callMessage, setCallMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(formData: FormData) {
    setError("");
    setSaving(true);
    try {
      const result = await saveSupplierContactAction(formData);
      if (result?.error) setError(result.error);
    } finally {
      setSaving(false);
    }
  }

  async function onCall(formData: FormData) {
    setCallMessage("");
    setError("");
    const result = await recordSupplierCallAction(formData);
    if (result?.error) setError(result.error);
    else setCallMessage("Call note saved.");
  }

  return (
    <div className="space-y-8">
      <form action={onSubmit} className="space-y-6 bg-white border border-neutral-200 p-6">
        {contact && <input type="hidden" name="id" value={contact.id} />}
        {error && (
          <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="company">
              Company
            </label>
            <input
              id="company"
              name="company"
              required
              className={inputClass}
              defaultValue={contact?.company}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="contactName">
              Contact name
            </label>
            <input
              id="contactName"
              name="contactName"
              className={inputClass}
              defaultValue={contact?.contactName}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="role">
              Role
            </label>
            <input id="role" name="role" className={inputClass} defaultValue={contact?.role} />
          </div>
          <div>
            <label className={labelClass} htmlFor="phone">
              Published business phone
            </label>
            <input id="phone" name="phone" className={inputClass} defaultValue={contact?.phone} />
          </div>
          <div>
            <label className={labelClass} htmlFor="email">
              Published business email
            </label>
            <input id="email" name="email" className={inputClass} defaultValue={contact?.email} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="sourceUrl">
              Source URL
            </label>
            <input
              id="sourceUrl"
              name="sourceUrl"
              className={inputClass}
              defaultValue={contact?.sourceUrl}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="supplierType">
              Supplier type
            </label>
            <input
              id="supplierType"
              name="supplierType"
              className={inputClass}
              defaultValue={contact?.supplierType}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="dealerWholesaleStatus">
              Dealer / wholesale status
            </label>
            <input
              id="dealerWholesaleStatus"
              name="dealerWholesaleStatus"
              className={inputClass}
              defaultValue={contact?.dealerWholesaleStatus}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="lastContactDate">
              Last contact date
            </label>
            <input
              id="lastContactDate"
              name="lastContactDate"
              type="date"
              className={inputClass}
              defaultValue={contact?.lastContactDate ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="nextFollowUpDate">
              Next follow-up date
            </label>
            <input
              id="nextFollowUpDate"
              name="nextFollowUpDate"
              type="date"
              className={inputClass}
              defaultValue={contact?.nextFollowUpDate ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="drivingDistanceMiles">
              Driving distance (miles)
            </label>
            <input
              id="drivingDistanceMiles"
              name="drivingDistanceMiles"
              type="number"
              className={inputClass}
              defaultValue={contact?.drivingDistanceMiles ?? ""}
            />
          </div>
          <label className="flex items-end gap-2 text-sm pb-3">
            <input type="checkbox" name="phoneVerified" defaultChecked={contact?.phoneVerified} />
            Phone verified on official site
          </label>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="callNotes">
              Call notes
            </label>
            <textarea
              id="callNotes"
              name="callNotes"
              rows={4}
              className={inputClass}
              defaultValue={contact?.callNotes}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="researchNotes">
              Research notes
            </label>
            <textarea
              id="researchNotes"
              name="researchNotes"
              rows={3}
              className={inputClass}
              defaultValue={contact?.researchNotes}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="min-h-11 bg-[#fc0527] px-6 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:opacity-60"
        >
          {saving ? "Saving…" : contact ? "Update contact" : "Add contact"}
        </button>
      </form>

      {contact && (
        <>
          <form action={onCall} className="space-y-4 bg-white border border-neutral-200 p-6">
            <input type="hidden" name="id" value={contact.id} />
            <h3 className="font-bold">Record a call</h3>
            {callMessage && (
              <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {callMessage}
              </div>
            )}
            <div>
              <label className={labelClass} htmlFor="callNote">
                Call note
              </label>
              <textarea id="callNote" name="callNote" rows={3} className={inputClass} required />
            </div>
            <div>
              <label className={labelClass} htmlFor="nextFollowUpDateCall">
                Next follow-up date
              </label>
              <input
                id="nextFollowUpDateCall"
                name="nextFollowUpDate"
                type="date"
                className={inputClass}
                defaultValue={contact.nextFollowUpDate ?? ""}
              />
            </div>
            <button
              type="submit"
              className="min-h-11 border border-neutral-300 bg-white px-6 text-sm font-semibold uppercase hover:bg-neutral-50"
            >
              Save call note
            </button>
          </form>

          <button
            type="button"
            className="min-h-11 text-sm font-semibold text-red-700 hover:underline"
            onClick={async () => {
              if (!confirm("Delete this supplier contact?")) return;
              const fd = new FormData();
              fd.set("id", contact.id);
              const result = await deleteSupplierContactAction(fd);
              if (result?.error) setError(result.error);
            }}
          >
            Delete contact
          </button>
        </>
      )}
    </div>
  );
}
