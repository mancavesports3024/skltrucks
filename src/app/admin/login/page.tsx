import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import AdminLoginForm from "@/components/admin/AdminLoginForm";

export default function AdminLoginPage() {
  const configured = isSupabaseConfigured();

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-lg bg-white p-8 shadow-lg">
          <h1 className="mb-4 text-2xl font-bold">Admin Setup Required</h1>
          <p className="mb-4 text-sm text-neutral-600 leading-relaxed">
            To enable inventory management, connect a free Supabase database. This replaces the
            WordPress admin your client used at{" "}
            <span className="font-mono text-xs">skltrucks.com/wp-admin</span>.
          </p>
          <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm text-neutral-700">
            <li>Create a project at <a href="https://supabase.com" className="text-[#fc0527] underline" target="_blank" rel="noreferrer">supabase.com</a></li>
            <li>Run <code className="bg-neutral-100 px-1">supabase/schema.sql</code> in the SQL Editor</li>
            <li>Add environment variables to <code className="bg-neutral-100 px-1">.env.local</code></li>
            <li>Create an admin user in Supabase → Authentication → Users</li>
            <li>Run <code className="bg-neutral-100 px-1">npm run seed</code> to import existing trucks</li>
          </ol>
          <Link href="/" className="text-sm text-[#fc0527] hover:underline">← Back to website</Link>
        </div>
      </div>
    );
  }

  return <AdminLoginForm />;
}
