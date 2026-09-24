"use client";

import { useState } from "react";
import {
  deleteTruckLeadAction,
  recordLeadCallAction,
  saveTruckLeadAction,
} from "@/app/admin/sourcing/actions";
import type { SupplierContact, TruckLead } from "@/types/sourcing";

const inputClass =
  "w-full min-h-11 border border-neutral-300 px-4 py-2.5 text-base sm:text-sm focus:border-[#fc0527] focus:outline-none focus:ring-1 focus:ring-[#fc0527]";
const labelClass = "block text-sm font-semibold mb-1";

function triSelect(
  name: string,
  label: string,
  value: boolean | null | undefined
) {
  const current = value === true ? "yes" : value === false ? "no" : "unknown";
  return (
    <div>
      <label className={labelClass} htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} className={inputClass} defaultValue={current}>
        <option value="unknown">Unknown</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>
  );
}

interface TruckLeadFormProps {
  lead?: TruckLead;
  contacts: SupplierContact[];
}

export default function TruckLeadForm({ lead, contacts }: TruckLeadFormProps) {
  const [error, setError] = useState("");
  const [callMessage, setCallMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(formData: FormData) {
    setError("");
    setSaving(true);
    try {
      const result = await saveTruckLeadAction(formData);
      if (result?.error) setError(result.error);
    } finally {
      setSaving(false);
    }
  }

  async function onCall(formData: FormData) {
    setCallMessage("");
    setError("");
    const result = await recordLeadCallAction(formData);
    if (result?.error) setError(result.error);
    else setCallMessage("Call note saved.");
  }

  return (
    <div className="space-y-8">
      <form action={onSubmit} className="space-y-6 bg-white border border-neutral-200 p-6">
        {lead && <input type="hidden" name="id" value={lead.id} />}
        {error && (
          <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="seller">
              Seller
            </label>
            <input id="seller" name="seller" className={inputClass} defaultValue={lead?.seller} />
          </div>
          <div>
            <label className={labelClass} htmlFor="supplierContactId">
              Linked supplier contact
            </label>
            <select
              id="supplierContactId"
              name="supplierContactId"
              className={inputClass}
              defaultValue={lead?.supplierContactId ?? ""}
            >
              <option value="">None</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="stockNumber">
              Stock number
            </label>
            <input
              id="stockNumber"
              name="stockNumber"
              className={inputClass}
              defaultValue={lead?.stockNumber}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="vin">
              VIN
            </label>
            <input id="vin" name="vin" className={inputClass} defaultValue={lead?.vin} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="sourceUrl">
              Source URL
            </label>
            <input
              id="sourceUrl"
              name="sourceUrl"
              className={inputClass}
              defaultValue={lead?.sourceUrl}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="canonicalListingUrl">
              Canonical individual listing URL
            </label>
            <input
              id="canonicalListingUrl"
              name="canonicalListingUrl"
              className={inputClass}
              defaultValue={lead?.canonicalListingUrl}
              placeholder="Defaults from source URL when set"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="sourceListingId">
              Source listing ID (local to seller/source)
            </label>
            <input
              id="sourceListingId"
              name="sourceListingId"
              className={inputClass}
              defaultValue={lead?.sourceListingId}
              placeholder="Defaults from stock number"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="sourceScope">
              Source scope (seller/host — for duplicate scoping)
            </label>
            <input
              id="sourceScope"
              name="sourceScope"
              className={inputClass}
              defaultValue={lead?.sourceScope}
              placeholder="Defaults from seller name"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="year">
              Year
            </label>
            <input
              id="year"
              name="year"
              type="number"
              className={inputClass}
              defaultValue={lead?.year ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="makeModel">
              Make / model
            </label>
            <input
              id="makeModel"
              name="makeModel"
              className={inputClass}
              defaultValue={lead?.makeModel}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="boxLengthFt">
              Box length (feet, exact)
            </label>
            <input
              id="boxLengthFt"
              name="boxLengthFt"
              type="number"
              step="0.1"
              className={inputClass}
              defaultValue={lead?.boxLengthFt ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="boxLengthRaw">
              Box length as listed
            </label>
            <input
              id="boxLengthRaw"
              name="boxLengthRaw"
              className={inputClass}
              defaultValue={lead?.boxLengthRaw}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="engine">
              Engine
            </label>
            <input id="engine" name="engine" className={inputClass} defaultValue={lead?.engine} />
          </div>
          {triSelect("engineIsCummins", "Cummins engine?", lead?.engineIsCummins)}
          <div>
            <label className={labelClass} htmlFor="transmission">
              Transmission
            </label>
            <input
              id="transmission"
              name="transmission"
              className={inputClass}
              defaultValue={lead?.transmission}
            />
          </div>
          {triSelect("transmissionIsAutomatic", "Automatic?", lead?.transmissionIsAutomatic)}
          <div>
            <label className={labelClass} htmlFor="listedWeightLbs">
              Listed weight (lbs)
            </label>
            <input
              id="listedWeightLbs"
              name="listedWeightLbs"
              type="number"
              className={inputClass}
              defaultValue={lead?.listedWeightLbs ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="listedWeightTerm">
              Listed weight term
            </label>
            <select
              id="listedWeightTerm"
              name="listedWeightTerm"
              className={inputClass}
              defaultValue={lead?.listedWeightTerm ?? "unknown"}
            >
              <option value="unknown">Unknown</option>
              <option value="gvw">GVW (not proof of GVWR)</option>
              <option value="gvwr">GVWR (manufacturer-rated on listing)</option>
              <option value="other">Other / ambiguous</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="manufacturerGvwrLbs">
              Manufacturer GVWR from door plate (lbs)
            </label>
            <input
              id="manufacturerGvwrLbs"
              name="manufacturerGvwrLbs"
              type="number"
              className={inputClass}
              defaultValue={lead?.manufacturerGvwrLbs ?? ""}
            />
          </div>
          <label className="flex items-end gap-2 text-sm pb-3">
            <input
              type="checkbox"
              name="gvwrDoorPlateVerified"
              defaultChecked={lead?.gvwrDoorPlateVerified}
            />
            Door-plate GVWR verified
          </label>
          <div>
            <label className={labelClass} htmlFor="mileage">
              Mileage
            </label>
            <input
              id="mileage"
              name="mileage"
              type="number"
              className={inputClass}
              defaultValue={lead?.mileage ?? ""}
            />
          </div>
          {triSelect("hasLiftgate", "Liftgate?", lead?.hasLiftgate)}
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="liftgateNotes">
              Liftgate notes
            </label>
            <input
              id="liftgateNotes"
              name="liftgateNotes"
              className={inputClass}
              defaultValue={lead?.liftgateNotes}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="price">
              Price
            </label>
            <input
              id="price"
              name="price"
              type="number"
              className={inputClass}
              defaultValue={lead?.price ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="location">
              Location
            </label>
            <input
              id="location"
              name="location"
              className={inputClass}
              defaultValue={lead?.location}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="drivingDistanceMiles">
              Estimated straight-line distance from Joplin (miles)
            </label>
            <input
              id="drivingDistanceMiles"
              name="drivingDistanceMiles"
              type="number"
              className={inputClass}
              defaultValue={lead?.drivingDistanceMiles ?? ""}
              placeholder="Leave blank if unknown — do not invent"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Legacy column <code className="font-mono">driving_distance_miles</code> stores
              Haversine/Census straight-line miles for the 1,200-mile classification rule — not
              Google city-center driving distance. Market Comparison transportation uses Google
              Routes separately.
            </p>
          </div>
          <label className="flex items-end gap-2 text-sm pb-3">
            <input
              type="checkbox"
              name="distanceIsEstimate"
              defaultChecked={lead?.distanceIsEstimate ?? true}
            />
            Distance is an estimate (straight-line)
          </label>
          <div>
            <label className={labelClass} htmlFor="dateLastChecked">
              Date last checked
            </label>
            <input
              id="dateLastChecked"
              name="dateLastChecked"
              type="date"
              className={inputClass}
              defaultValue={lead?.dateLastChecked ?? ""}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="workflowStatus">
              Workflow status
            </label>
            <select
              id="workflowStatus"
              name="workflowStatus"
              className={inputClass}
              defaultValue={lead?.workflowStatus ?? "new"}
            >
              <option value="new">New</option>
              <option value="researching">Researching</option>
              <option value="contacted">Contacted</option>
              <option value="waiting">Waiting</option>
              <option value="passed">Passed</option>
              <option value="purchased">Purchased</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="verificationNotes">
              Verification notes
            </label>
            <textarea
              id="verificationNotes"
              name="verificationNotes"
              rows={3}
              className={inputClass}
              defaultValue={lead?.verificationNotes}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="sklCallNotes">
              SKL call notes
            </label>
            <textarea
              id="sklCallNotes"
              name="sklCallNotes"
              rows={4}
              className={inputClass}
              defaultValue={lead?.sklCallNotes}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="researchUncertaintyLabels">
              Uncertainty labels (comma or newline separated)
            </label>
            <textarea
              id="researchUncertaintyLabels"
              name="researchUncertaintyLabels"
              rows={2}
              className={inputClass}
              defaultValue={lead?.researchUncertaintyLabels.join(", ")}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isSeedResearch" defaultChecked={lead?.isSeedResearch} />
            Unverified seed research
          </label>
          <div>
            <label className={labelClass} htmlFor="seedSource">
              Seed source label
            </label>
            <input
              id="seedSource"
              name="seedSource"
              className={inputClass}
              defaultValue={lead?.seedSource}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="min-h-11 bg-[#fc0527] px-6 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:opacity-60"
        >
          {saving ? "Saving…" : lead ? "Update lead" : "Add lead"}
        </button>
      </form>

      {lead && (
        <>
          <form action={onCall} className="space-y-4 bg-white border border-neutral-200 p-6">
            <input type="hidden" name="id" value={lead.id} />
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
              <label className={labelClass} htmlFor="nextFollowUpDate">
                Next follow-up date (optional — also updates linked supplier)
              </label>
              <input id="nextFollowUpDate" name="nextFollowUpDate" type="date" className={inputClass} />
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
              if (!confirm("Delete this sourcing lead?")) return;
              const fd = new FormData();
              fd.set("id", lead.id);
              const result = await deleteTruckLeadAction(fd);
              if (result?.error) setError(result.error);
            }}
          >
            Delete lead
          </button>
        </>
      )}
    </div>
  );
}
