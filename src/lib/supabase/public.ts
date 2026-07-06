import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Cookie-free client for public reads — safe during static generation at build time. */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
