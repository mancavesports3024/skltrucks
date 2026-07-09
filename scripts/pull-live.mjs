/**
 * Pull latest inventory from skltrucks.com (WordPress/WooCommerce)
 * and load it into Supabase for the new site.
 *
 * Usage: npm run pull-live
 * Requires .env.local with Supabase keys.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const productsPath = path.join(root, "..", "products.json");
const LIVE_API = "https://skltrucks.com/wp-json/wc/store/v1/products";

async function fetchAllLiveProducts() {
  const all = [];
  let page = 1;

  while (true) {
    const url = `${LIVE_API}?per_page=100&page=${page}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Live site returned ${res.status}. Check that skltrucks.com is online.`);
    }

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    all.push(...batch);
    if (batch.length < 100) break;
    page++;
  }

  return all;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  console.log("Pulling inventory from skltrucks.com...\n");

  const products = await fetchAllLiveProducts();
  console.log(`Found ${products.length} product(s) on the live site.`);

  fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));
  console.log(`Saved ${productsPath}\n`);

  console.log("Updating static inventory fallback...");
  run("node", ["scripts/sync-inventory.mjs"]);

  console.log("\nSeeding Supabase...");
  run("node", ["--env-file=.env.local", "scripts/seed-supabase.mjs"]);

  console.log("\nPull complete.");
  console.log("Next: check /admin (inventory) and /shop on the new site.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
