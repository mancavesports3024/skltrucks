import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/lib/constants";

const QUICK_LINKS = [
  { label: "Home", href: "/" },
  { label: "Contact Us", href: "/contact-us" },
  { label: "Inventory", href: "/shop" },
  { label: "Services", href: "/services" },
];

const MAP_EMBED = `https://maps.google.com/maps?q=${encodeURIComponent(SITE.address)}&hl=en&z=14&output=embed`;

export default function Footer() {
  return (
    <footer className="bg-neutral-900 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link href="/" className="mb-5 inline-block">
            <Image
              src={SITE.logo}
              alt={SITE.name}
              width={220}
              height={110}
              className="h-24 w-auto"
            />
          </Link>
          <p className="text-sm leading-relaxed text-neutral-300">
            We are a family-owned company where integrity meets trucking! We buy and sell class 7
            &amp; 8 trucks and trailers located on Route 66 in Southwest Missouri.
          </p>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide">Quick Link</h3>
          <ul className="space-y-2 text-sm text-neutral-300">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="uppercase hover:text-[#fc0527] transition-colors">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide">Contact Info</h3>
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
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide">Location</h3>
          <div className="overflow-hidden rounded-sm border border-neutral-700">
            <iframe
              title="SKL Trucks LLC location"
              src={MAP_EMBED}
              width="100%"
              height="180"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-800 py-5 text-center text-sm text-neutral-500">
        Copyright © {new Date().getFullYear()}. All Rights Reserved — {SITE.name}
      </div>
    </footer>
  );
}
