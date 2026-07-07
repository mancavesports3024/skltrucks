"use client";

import Link from "next/link";
import { useState } from "react";
import { INVENTORY_CATEGORIES, MANUFACTURERS } from "@/lib/constants";

interface ShopFiltersProps {
  category?: string;
  manufacturer?: string;
}

export default function ShopFilters({ category, manufacturer }: ShopFiltersProps) {
  const [open, setOpen] = useState(false);

  const activeCount = (category ? 1 : 0) + (manufacturer ? 1 : 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mb-4 flex w-full min-h-12 items-center justify-between border border-neutral-300 bg-white px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide lg:hidden"
        aria-expanded={open}
      >
        <span>
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </span>
        <svg
          className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <aside className={`lg:col-span-1 ${open ? "block" : "hidden lg:block"}`}>
        <div className="space-y-6 lg:sticky lg:top-32">
          <div className="border border-neutral-200 bg-white p-4 lg:border-0 lg:bg-transparent lg:p-0">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Categories</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/shop"
                  className={`block py-1 hover:text-[#fc0527] ${!category ? "font-bold text-[#fc0527]" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  All Trucks
                </Link>
              </li>
              {INVENTORY_CATEGORIES.map((cat) => (
                <li key={cat.slug}>
                  <Link
                    href={`/shop?category=${cat.slug}`}
                    className={`block py-1 leading-snug hover:text-[#fc0527] ${category === cat.slug ? "font-bold text-[#fc0527]" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    {cat.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-neutral-200 bg-white p-4 lg:border-0 lg:bg-transparent lg:p-0">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Manufacturers</h2>
            <ul className="space-y-2 text-sm">
              {MANUFACTURERS.map((m) => (
                <li key={m.slug}>
                  <Link
                    href={`/shop?manufacturer=${m.slug}`}
                    className={`block py-1 hover:text-[#fc0527] ${manufacturer === m.slug ? "font-bold text-[#fc0527]" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    {m.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </>
  );
}
