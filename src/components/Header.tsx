"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { NAV_LINKS, SITE } from "@/lib/constants";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      <div className="bg-neutral-900 text-white text-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2">
          <div className="flex items-center gap-6">
            <a href={SITE.phoneHref} className="hover:text-[#fc0527] transition-colors">
              {SITE.phone}
            </a>
            <a href={`mailto:${SITE.email}`} className="hover:text-[#fc0527] transition-colors hidden sm:inline">
              {SITE.email}
            </a>
          </div>
          <div className="flex items-center gap-3">
            <a href={SITE.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="hover:text-[#fc0527]">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </a>
            <a href={SITE.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="hover:text-[#fc0527]">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <Link href="/" className="shrink-0">
          <Image src={SITE.logo} alt={SITE.name} width={200} height={100} className="h-14 w-auto" priority />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) =>
            link.children ? (
              <div
                key={link.label}
                className="relative"
                onMouseEnter={() => setOpenDropdown(link.label)}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                <button className="px-3 py-2 text-sm font-semibold uppercase tracking-wide hover:text-[#fc0527] transition-colors">
                  {link.label}
                </button>
                {openDropdown === link.label && (
                  <div className="absolute left-0 top-full min-w-[280px] bg-white shadow-lg border border-neutral-100 py-2">
                    {link.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="block px-4 py-2 text-sm hover:bg-neutral-50 hover:text-[#fc0527]"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className="px-3 py-2 text-sm font-semibold uppercase tracking-wide hover:text-[#fc0527] transition-colors"
              >
                {link.label}
              </Link>
            )
          )}
        </nav>

        <Link
          href="/sell-my-truck"
          className="hidden lg:inline-flex bg-[#fc0527] text-white px-5 py-2.5 text-sm font-semibold uppercase tracking-wide hover:bg-[#d90422] transition-colors rounded-sm"
        >
          Sell My Truck
        </Link>

        <button
          className="lg:hidden p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <nav className="lg:hidden border-t border-neutral-100 bg-white px-4 py-4">
          {NAV_LINKS.map((link) => (
            <div key={link.label} className="border-b border-neutral-100 py-2">
              <Link href={link.href} className="block font-semibold uppercase text-sm py-1" onClick={() => setMobileOpen(false)}>
                {link.label}
              </Link>
              {link.children?.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  className="block pl-4 py-1 text-sm text-neutral-600"
                  onClick={() => setMobileOpen(false)}
                >
                  {child.label}
                </Link>
              ))}
            </div>
          ))}
          <Link
            href="/sell-my-truck"
            className="mt-4 block bg-[#fc0527] text-white text-center px-5 py-3 text-sm font-semibold uppercase"
            onClick={() => setMobileOpen(false)}
          >
            Sell My Truck
          </Link>
        </nav>
      )}
    </header>
  );
}
