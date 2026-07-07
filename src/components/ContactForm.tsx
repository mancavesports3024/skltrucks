"use client";

import { useState } from "react";
import { SITE } from "@/lib/constants";

const inputClass =
  "w-full min-h-11 border border-neutral-300 px-4 py-2.5 text-base sm:text-sm focus:border-[#fc0527] focus:outline-none focus:ring-1 focus:ring-[#fc0527]";

export default function ContactForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    setStatus(res.ok ? "success" : "error");
    if (res.ok) e.currentTarget.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <input name="name" type="text" placeholder="Name *" required className={inputClass} />
        <input name="email" type="email" placeholder="Email *" required className={inputClass} />
      </div>
      <input name="phone" type="tel" placeholder="Phone" className={inputClass} />
      <textarea name="message" placeholder="Message *" required rows={5} className={inputClass} />
      <button
        type="submit"
        disabled={status === "loading"}
        className="min-h-12 w-full bg-[#fc0527] px-8 py-3 text-sm font-semibold uppercase text-white transition-colors hover:bg-[#d90422] disabled:opacity-60 sm:w-auto"
      >
        {status === "loading" ? "Sending..." : "Submit"}
      </button>
      {status === "success" && (
        <p className="text-green-600 text-sm">Thank you! We&apos;ll get back to you soon.</p>
      )}
      {status === "error" && (
        <p className="text-red-600 text-sm">
          Something went wrong. Please call us at{" "}
          <a href={SITE.phoneHref} className="underline">{SITE.phone}</a>.
        </p>
      )}
    </form>
  );
}
