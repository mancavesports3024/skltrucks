import Link from "next/link";
import { redirect } from "next/navigation";
import AdminHeader, { type AdminTab } from "@/components/admin/AdminHeader";
import ChangePasswordForm from "@/components/admin/ChangePasswordForm";
import HomepageManagement from "@/components/admin/HomepageManagement";
import InventoryList from "@/components/admin/InventoryList";
import { getAdminEmail } from "@/app/admin/actions";
import { getAllProductsAdmin } from "@/lib/inventory";
import { getSiteContentAdmin } from "@/lib/site-content";
import { isSupabaseConfigured } from "@/lib/supabase/config";

interface AdminPageProps {
  searchParams: Promise<{ tab?: string }>;
}

function getActiveTab(tab?: string): AdminTab {
  if (tab === "homepage") return "homepage";
  if (tab === "account") return "account";
  return "inventory";
}

export default async function AdminDashboard({ searchParams }: AdminPageProps) {
  const { tab } = await searchParams;
  const activeTab = getActiveTab(tab);
  const dbReady = isSupabaseConfigured();

  if (activeTab === "homepage") {
    const content = await getSiteContentAdmin();

    return (
      <div>
        <AdminHeader activeTab="homepage" />
        <HomepageManagement initialContent={content} dbReady={dbReady} />
      </div>
    );
  }

  if (activeTab === "account") {
    const email = await getAdminEmail();
    if (!email) redirect("/admin/login");

    return (
      <div>
        <AdminHeader activeTab="account" />
        <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
          <ChangePasswordForm email={email} />
        </div>
      </div>
    );
  }

  const products = await getAllProductsAdmin();

  return (
    <div>
      <AdminHeader activeTab="inventory" />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        {!dbReady && (
          <div className="mb-6 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <strong>Database not connected.</strong> Add Supabase environment variables to enable
            saving inventory. See README for setup instructions.
          </div>
        )}

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-neutral-600">{products.length} trucks in inventory</p>
          {dbReady && (
            <Link
              href="/admin/products/new"
              className="flex min-h-12 items-center justify-center bg-[#fc0527] px-6 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] sm:inline-flex sm:py-2.5"
            >
              + Add Truck
            </Link>
          )}
        </div>

        {dbReady && products.length === 0 && (
          <div className="mb-6 border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            No trucks in the database yet. Click <strong>+ Add Truck</strong> to create one, or run{" "}
            <code className="bg-blue-100 px-1">npm run seed</code> to import existing inventory.
          </div>
        )}

        <InventoryList products={products} dbReady={dbReady} />
      </div>
    </div>
  );
}
