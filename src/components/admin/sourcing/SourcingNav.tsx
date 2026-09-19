import Link from "next/link";

export type SourcingTab =
  | "overview"
  | "leads"
  | "contacts"
  | "profile"
  | "digest"
  | "intake"
  | "search";

interface SourcingNavProps {
  active: SourcingTab;
}

const TABS: { id: SourcingTab; label: string; href: string }[] = [
  { id: "overview", label: "Overview", href: "/admin/sourcing" },
  { id: "search", label: "Search", href: "/admin/sourcing/search" },
  { id: "leads", label: "Truck leads", href: "/admin/sourcing/leads" },
  { id: "intake", label: "Intake", href: "/admin/sourcing/intake" },
  { id: "contacts", label: "Suppliers", href: "/admin/sourcing/contacts" },
  { id: "profile", label: "Buying profile", href: "/admin/sourcing/profile" },
  { id: "digest", label: "Daily digest", href: "/admin/sourcing/digest" },
];

export default function SourcingNav({ active }: SourcingNavProps) {
  return (
    <div className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin" className="text-sm text-neutral-500 hover:text-[#fc0527]">
            ← Admin
          </Link>
          <h1 className="text-lg font-bold text-neutral-900">Private sourcing</h1>
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5">
            Staff only
          </span>
        </div>
        <p className="text-xs text-neutral-500">Not published to the public inventory</p>
      </div>
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors sm:px-5 ${
              active === tab.id
                ? "border-[#fc0527] text-[#fc0527]"
                : "border-transparent text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
