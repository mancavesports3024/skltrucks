/**
 * Seed private sourcing tables from unverified research data.
 * Requires authenticated service role — prefer using the Admin UI button
 * "Import unverified seed research" while signed in, which uses the user session.
 *
 * This script uses the service role for local/CI setup only:
 *   npm run seed-sourcing
 *
 * Does NOT scrape supplier sites or send email.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

console.log(`
This seed script requires:
  1. supabase/sourcing-schema.sql already applied in Supabase SQL Editor
  2. Service role key in .env.local

Prefer importing via /admin/sourcing while signed in (uses auth session + RLS).

For a one-shot service-role import of the TypeScript seed module, use the Admin UI
or a future dedicated loader. This placeholder confirms env only.
`);

const supabase = createClient(url, key);
const { error } = await supabase.from("sourcing_buying_profile").select("id").limit(1);
if (error) {
  console.error("sourcing_buying_profile not reachable:", error.message);
  console.error("Run supabase/sourcing-schema.sql in the Supabase SQL Editor first.");
  process.exit(1);
}

console.log("Sourcing schema looks available. Use Admin → Sourcing → Import unverified seed research.");
