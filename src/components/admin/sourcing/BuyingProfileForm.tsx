"use client";

import { useState } from "react";
import { updateBuyingProfileAction } from "@/app/admin/sourcing/actions";
import type { BuyingProfile } from "@/types/sourcing";
import { earliestAcceptedModelYear } from "@/lib/sourcing/match";

const inputClass =
  "w-full min-h-11 border border-neutral-300 px-4 py-2.5 text-base sm:text-sm focus:border-[#fc0527] focus:outline-none focus:ring-1 focus:ring-[#fc0527]";
const labelClass = "block text-sm font-semibold mb-1";

export default function BuyingProfileForm({ profile }: { profile: BuyingProfile }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [maxAgeYears, setMaxAgeYears] = useState(profile.maxAgeYears);
  const earliest = earliestAcceptedModelYear({ maxAgeYears });

  async function onSubmit(formData: FormData) {
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const result = await updateBuyingProfileAction(formData);
      if (result?.error) setError(result.error);
      else {
        setMessage(
          `Profile saved. Reclassified ${result?.updatedLeads ?? 0} lead(s) with the new rules.`
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form action={onSubmit} className="space-y-6 bg-white border border-neutral-200 p-6">
      <div>
        <h2 className="text-lg font-bold">Buying profile</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Stored in the database and used to classify leads. Changing these values re-runs matching
          for all leads.
        </p>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}
      {message && (
        <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {message}
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold uppercase tracking-wide text-neutral-500">
          Required
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="requireCummins" defaultChecked={profile.requireCummins} />
          Cummins engine required
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="requireAutomatic"
            defaultChecked={profile.requireAutomatic}
          />
          Automatic transmission required
        </label>
        <div>
          <label className={labelClass} htmlFor="requiredBoxLengthsFt">
            Accepted box lengths (feet, comma-separated)
          </label>
          <input
            id="requiredBoxLengthsFt"
            name="requiredBoxLengthsFt"
            className={inputClass}
            defaultValue={profile.requiredBoxLengthsFt.join(", ")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="maxGvwrLbs">
              Max GVWR (lbs)
            </label>
            <input
              id="maxGvwrLbs"
              name="maxGvwrLbs"
              type="number"
              className={inputClass}
              defaultValue={profile.maxGvwrLbs}
            />
          </div>
          <label className="flex items-end gap-2 text-sm pb-3">
            <input
              type="checkbox"
              name="gvwrMustBeStrictlyBelow"
              defaultChecked={profile.gvwrMustBeStrictlyBelow}
            />
            Strictly below max (legacy; leave unchecked so ≤ max is accepted and ≥ max+1 is rejected)
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="maxMileage">
              Maximum mileage
            </label>
            <input
              id="maxMileage"
              name="maxMileage"
              type="number"
              className={inputClass}
              defaultValue={profile.maxMileage}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="maxAgeYears">
              Maximum age (model years)
            </label>
            <input
              id="maxAgeYears"
              name="maxAgeYears"
              type="number"
              className={inputClass}
              value={maxAgeYears}
              onChange={(e) => setMaxAgeYears(Number(e.target.value) || 0)}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Earliest accepted model year right now: <strong>{earliest}</strong> (calendar year −
              age)
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold uppercase tracking-wide text-neutral-500">
          Preferred / display
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="preferLiftgate" defaultChecked={profile.preferLiftgate} />
          Liftgate preferred (not a hard exclusion)
        </label>
        <div>
          <label className={labelClass} htmlFor="preferredMaxDrivingMiles">
            Preferred max driving miles from origin
          </label>
          <input
            id="preferredMaxDrivingMiles"
            name="preferredMaxDrivingMiles"
            type="number"
            className={inputClass}
            defaultValue={profile.preferredMaxDrivingMiles}
          />
          <p className="mt-1 text-xs text-neutral-500">
            Classification preference only (straight-line today). Does not call Google Routes.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="transportationRatePerMile">
              Transportation rate per mile ($)
            </label>
            <input
              id="transportationRatePerMile"
              name="transportationRatePerMile"
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              defaultValue={profile.transportationRatePerMile}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Market Comparison default. Transportation = driving miles × this rate. Default $2.25.
            </p>
          </div>
          <div>
            <label className={labelClass} htmlFor="defaultInspectionCost">
              Default inspection cost ($)
            </label>
            <input
              id="defaultInspectionCost"
              name="defaultInspectionCost"
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              defaultValue={profile.defaultInspectionCost}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Prefills Market Comparison Inspection after driving distance is calculated. Default
              $230.
            </p>
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="originLabel">
            Origin
          </label>
          <input
            id="originLabel"
            name="originLabel"
            className={inputClass}
            defaultValue={profile.originLabel}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="maxPrice">
            Maximum price (leave blank = show price, do not filter)
          </label>
          <input
            id="maxPrice"
            name="maxPrice"
            type="number"
            step="1"
            className={inputClass}
            defaultValue={profile.maxPrice ?? ""}
            placeholder="Unset"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="notes">
            Profile notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className={inputClass}
            defaultValue={profile.notes}
          />
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={saving}
        className="min-h-11 bg-[#fc0527] px-6 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save buying profile"}
      </button>
    </form>
  );
}
