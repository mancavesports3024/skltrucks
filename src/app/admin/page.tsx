import Image from "next/image";
import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import HomepageManagement from "@/components/admin/HomepageManagement";
import DeleteButton from "@/components/admin/DeleteButton";
import { getAllProductsAdmin, formatPrice } from "@/lib/inventory";
import { getSiteContentAdmin } from "@/lib/site-content";
import { isSupabaseConfigured } from "@/lib/supabase/config";

interface AdminPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function AdminDashboard({ searchParams }: AdminPageProps) {
  const { tab } = await searchParams;
  const activeTab = tab === "homepage" ? "homepage" : "inventory";
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

  const products = await getAllProductsAdmin();

  return (
    <div>
      <AdminHeader activeTab="inventory" />

      <div className="mx-auto max-w-7xl px-4 py-8">
        {!dbReady && (
          <div className="mb-6 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <strong>Database not connected.</strong> Add Supabase environment variables to enable
            saving inventory. See README for setup instructions.
          </div>
        )}

        <div className="mb-6 flex items-center justify-between">
          <p className="text-neutral-600">{products.length} trucks in inventory</p>
          <Link
            href="/admin/products/new"
            className="bg-[#fc0527] px-6 py-2.5 text-sm font-semibold uppercase text-white hover:bg-[#d90422]"
          >
            + Add Truck
          </Link>
        </div>

        <div className="overflow-x-auto bg-white shadow">
          <table className="w-full text-sm">
            <thead className="border-b bg-neutral-50 text-left">
              <tr>
                <th className="p-4">Photo</th>
                <th className="p-4">Name</th>
                <th className="p-4">Price</th>
                <th className="p-4">VIN</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b hover:bg-neutral-50">
                  <td className="p-4">
                    {product.image && (
                      <div className="relative h-14 w-20">
                        <Image
                          src={product.image}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="80px"
                        />
                      </div>
                    )}
                  </td>
                  <td className="p-4 max-w-xs">
                    <p className="font-medium line-clamp-2">{product.name}</p>
                    <p className="text-xs text-neutral-500">
                      {product.year} {product.manufacturer}
                    </p>
                  </td>
                  <td className="p-4 font-semibold">{formatPrice(product.price)}</td>
                  <td className="p-4 font-mono text-xs">{product.vin}</td>
                  <td className="p-4">
                    <span
                      className={`rounded px-2 py-1 text-xs font-semibold ${
                        product.published !== false
                          ? "bg-green-100 text-green-700"
                          : "bg-neutral-200 text-neutral-600"
                      }`}
                    >
                      {product.published !== false ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="font-medium text-[#fc0527] hover:underline"
                      >
                        Edit
                      </Link>
                      {dbReady && (
                        <Link
                          href={`/admin/products/new?copyFrom=${product.id}`}
                          className="font-medium text-neutral-700 hover:underline"
                        >
                          Copy
                        </Link>
                      )}
                      {dbReady && <DeleteButton id={product.id} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
