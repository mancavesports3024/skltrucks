"use client";

import { useState } from "react";
import { SITE } from "@/lib/constants";

const inputClass =
  "w-full border border-neutral-300 px-4 py-2.5 text-sm focus:border-[#fc0527] focus:outline-none focus:ring-1 focus:ring-[#fc0527]";
const labelClass = "block text-sm font-semibold mb-1";

function Field({ label, name, type = "text", required }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input name={name} type={type} required={required} className={inputClass} />
    </div>
  );
}

export default function FinancingForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/financing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    setStatus(res.ok ? "success" : "error");
    if (res.ok) e.currentTarget.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section>
        <h2 className="text-xl font-bold mb-4 border-b pb-2">Company Information</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Company Name" name="companyName" required />
          <Field label="Federal Tax ID" name="federalTaxId" />
          <Field label="Contact Name" name="contactName" required />
          <Field label="MC/DOT#" name="mcDot" />
          <Field label="Phone Number" name="phone" type="tel" required />
          <Field label="Annual Revenue" name="annualRevenue" />
          <Field label="Fax Number" name="fax" />
          <Field label="Corporation Type" name="corporationType" />
          <Field label="Email Address" name="email" type="email" required />
          <Field label="Year Started" name="yearStarted" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Street Address" name="street" />
          <Field label="City" name="city" />
          <Field label="State" name="state" />
          <Field label="ZIP" name="zip" />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4 border-b pb-2">Number of Units in the Fleet</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Tractors" name="tractors" />
          <Field label="Trailers" name="trailers" />
          <Field label="Light / Medium Duty" name="lightMediumDuty" />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4 border-b pb-2">Equipment to Purchase Information</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Year" name="equipYear" />
          <Field label="Purchase Price" name="purchasePrice" />
          <Field label="Make" name="equipMake" />
          <Field label="Dealer" name="dealer" />
          <Field label="Model" name="equipModel" />
          <Field label="Dealer Contact Name" name="dealerContact" />
          <Field label="Odometer" name="odometer" />
          <Field label="Dealer Contact Number" name="dealerPhone" />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4 border-b pb-2">Bank Information</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Bank Name" name="bankName" />
          <Field label="Checking" name="checking" />
          <Field label="Average Bank Balance" name="avgBalance" />
          <Field label="Savings" name="savings" />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4 border-b pb-2">References</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Hauling Reference Company Name" name="haulingRef" />
          <Field label="How Many Years" name="haulingYears" />
          <Field label="Equipment Finance Reference" name="equipFinanceRef" />
          <Field label="Products Hauled" name="productsHauled" />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4 border-b pb-2">Personal Guarantor Information</h2>
        {[1, 2].map((n) => (
          <div key={n} className="mb-6 p-4 bg-neutral-50 rounded">
            <h3 className="font-semibold mb-3">Guarantor {n}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name" name={`guarantor${n}Name`} />
              <Field label="Social Security" name={`guarantor${n}SSN`} />
              <Field label="DOB" name={`guarantor${n}DOB`} type="date" />
              <Field label="Percentage Owned" name={`guarantor${n}Percent`} />
              <div>
                <label className={labelClass}>Rent / Homeowner</label>
                <select name={`guarantor${n}Housing`} className={inputClass}>
                  <option value="">Select</option>
                  <option value="rent">Rent</option>
                  <option value="homeowner">Homeowner</option>
                </select>
              </div>
              <Field label="Street Address" name={`guarantor${n}Street`} />
              <Field label="City" name={`guarantor${n}City`} />
              <Field label="State" name={`guarantor${n}State`} />
              <Field label="ZIP" name={`guarantor${n}Zip`} />
            </div>
          </div>
        ))}
      </section>

      <section className="text-xs text-neutral-600 bg-neutral-50 p-4 rounded">
        <p>
          DISCLAIMER: By signing below, I 1) certify that the information above is true and correct,
          2) authorize review of all credit information provided, 3) understand that individual credit
          history may factor into the application decision, 4) waive any right under the Fair Credit
          Reporting Act, and 5) certify that this request is for commercial (business) and not personal
          (consumer) use.
        </p>
      </section>

      <section>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((n) => (
            <div key={n} className="space-y-4">
              <Field label={`Signature ${n}`} name={`signature${n}`} required={n === 1} />
              <Field label="Title" name={`title${n}`} />
              <Field label="Date" name={`date${n}`} type="date" />
            </div>
          ))}
        </div>
      </section>

      <button
        type="submit"
        disabled={status === "loading"}
        className="bg-[#fc0527] px-8 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:opacity-60"
      >
        {status === "loading" ? "Submitting..." : "Submit Application"}
      </button>
      {status === "success" && <p className="text-green-600 text-sm">Application submitted successfully!</p>}
      {status === "error" && (
        <p className="text-red-600 text-sm">Error submitting. Call <a href={SITE.phoneHref}>{SITE.phone}</a>.</p>
      )}
    </form>
  );
}
