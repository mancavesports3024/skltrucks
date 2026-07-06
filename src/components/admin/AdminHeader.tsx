import Link from "next/link";
import { signOut } from "@/app/admin/actions";

interface AdminHeaderProps {
  activeTab: "inventory" | "homepage";
}

export default function AdminHeader({ activeTab }: AdminHeaderProps) {
  const tabs = [
    { id: "inventory" as const, label: "Inventory", href: "/admin" },
    { id: "homepage" as const, label: "Homepage", href: "/admin?tab=homepage" },
  ];

  return (
    <>
      <header className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">SKL Trucks Admin</h1>
            <p className="text-sm text-neutral-400">Manage inventory and homepage content</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" target="_blank" className="text-sm hover:text-[#fc0527]">
              View Site
            </Link>
            <form action={signOut}>
              <button type="submit" className="text-sm hover:text-[#fc0527]">
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl gap-1 px-4">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className={`border-b-2 px-6 py-4 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? "border-[#fc0527] text-[#fc0527]"
                  : "border-transparent text-neutral-600 hover:text-neutral-900"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
