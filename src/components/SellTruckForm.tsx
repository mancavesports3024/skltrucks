"use client";

import { useState } from "react";
import { SITE } from "@/lib/constants";

const inputClass =
  "w-full border border-neutral-300 px-4 py-2.5 text-sm focus:border-[#fc0527] focus:outline-none focus:ring-1 focus:ring-[#fc0527]";
const labelClass = "block text-sm font-semibold mb-1";

export default function SellTruckForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/sell-truck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    setStatus(res.ok ? "success" : "error");
    if (res.ok) e.currentTarget.reset();
  }

  const years = Array.from({ length: 103 }, (_, i) => 2026 - i);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset>
        <legend className={labelClass}>What are you looking to do?</legend>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="intent" value="consign" required /> Consign
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="intent" value="sell" required /> Sell
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>First Name *</label>
          <input name="firstName" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Last Name *</label>
          <input name="lastName" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Email *</label>
          <input name="email" type="email" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Phone *</label>
          <input name="phone" type="tel" required className={inputClass} />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold mb-3">Equipment Location</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <input name="city" placeholder="City" className={inputClass} />
          <input name="state" placeholder="State" className={inputClass} />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold mb-3">Equipment Info</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <input name="manufacturer" placeholder="Manufacturer" className={inputClass} />
          <input name="model" placeholder="Model" className={inputClass} />
          <select name="year" className={inputClass}>
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Accessories, options, or things to know</label>
        <textarea name="accessories" rows={3} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Questions or Comments</label>
        <textarea name="comments" rows={3} className={inputClass} />
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="bg-[#fc0527] px-8 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:opacity-60"
      >
        {status === "loading" ? "Submitting..." : "Submit"}
      </button>
      {status === "success" && <p className="text-green-600 text-sm">Thank you! We&apos;ll be in touch.</p>}
      {status === "error" && (
        <p className="text-red-600 text-sm">Error submitting. Call <a href={SITE.phoneHref}>{SITE.phone}</a>.</p>
      )}
    </form>
  );
}
