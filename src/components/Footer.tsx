import Image from "next/image";
import Link from "next/link";
import { NAV_LINKS, SITE } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="bg-neutral-900 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-3">
        <div>
          <h3 className="mb-4 text-lg font-bold uppercase tracking-wide">Quick Link</h3>
          <ul className="space-y-2 text-sm text-neutral-300">
            {NAV_LINKS.filter((l) => !l.children).map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-[#fc0527] transition-colors uppercase">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/shop" className="hover:text-[#fc0527] transition-colors uppercase">
                Inventory
              </Link>
            </li>
            <li>
              <Link href="/services" className="hover:text-[#fc0527] transition-colors uppercase">
                Services
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-lg font-bold uppercase tracking-wide">Contact Info</h3>
          <ul className="space-y-3 text-sm text-neutral-300">
            <li>{SITE.address}</li>
            <li>
              <a href={SITE.phoneHref} className="hover:text-[#fc0527] transition-colors">
                {SITE.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${SITE.email}`} className="hover:text-[#fc0527] transition-colors">
                {SITE.email}
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-lg font-bold uppercase tracking-wide">Location</h3>
          <p className="text-sm text-neutral-300 mb-4">
            We are a family-owned company where integrity meets trucking! We buy and sell class 7 &amp; 8
            trucks and trailers located on Route 66 in Southwest Missouri.
          </p>
          <div className="flex gap-3">
            <a href={SITE.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-[#fc0527]" aria-label="Facebook">
              Facebook
            </a>
            <a href={SITE.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-[#fc0527]" aria-label="LinkedIn">
              LinkedIn
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-800 px-4 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4">
          <Link href="/">
            <Image
              src={SITE.logo}
              alt={SITE.name}
              width={240}
              height={120}
              className="h-20 w-auto"
            />
          </Link>
          <p className="text-center text-sm text-neutral-500">
            Copyright © {new Date().getFullYear()}. All Rights Reserved — {SITE.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
