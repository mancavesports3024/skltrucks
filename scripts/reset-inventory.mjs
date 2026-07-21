/**
 * Clear all products from Supabase, then pull fresh inventory from skltrucks.com.
 *
 * Usage:
 *   npm run reset-inventory
 *
 * You must type YES to confirm. Pass --yes to skip the prompt (use carefully).
 * Requires .env.local with Supabase keys.
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");

function loadEnvLocal() {
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env.local — copy .env.local.example and add your Supabase keys.");
    process.exit(1);
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const skipPrompt = process.argv.includes("--yes");
  const supabase = createClient(url, key);

  const { count, error: countError } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error("Could not read products:", countError.message);
    process.exit(1);
  }

  console.log(`\nThis will DELETE all ${count ?? 0} truck(s) from Supabase,`);
  console.log("then pull fresh inventory from skltrucks.com and re-seed.\n");
  console.log("Does NOT delete: admin users, site content, or Storage images.\n");

  if (!skipPrompt) {
    const answer = await ask('Type YES to continue (anything else cancels): ');
    if (answer !== "YES") {
      console.log("Cancelled — database unchanged.");
      process.exit(0);
    }
  }

  console.log("\nClearing products...");
  const { error: deleteError } = await supabase.from("products").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError) {
    console.error("Failed to clear products:", deleteError.message);
    process.exit(1);
  }

  const { count: afterCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });

  console.log(`Products remaining: ${afterCount ?? 0}`);
  console.log("\nRunning pull-live...\n");

  const result = spawnSync("node", ["scripts/pull-live.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log("\nReset complete — database refreshed from the live site.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
