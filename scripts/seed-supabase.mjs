/**
 * Seed Supabase with existing inventory from products.json or WooCommerce API.
 *
 * Setup:
 *   1. Run supabase/schema.sql in your Supabase SQL Editor
 *   2. Create an admin user in Supabase → Authentication → Users
 *   3. Copy .env.local.example to .env.local and fill in keys
 *   4. npm run seed
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

function decodeHtml(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#038;/g, "&");
}

function stripTags(html) {
  return decodeHtml(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseSummaryTable(html) {
  const specs = {};
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      stripTags(m[1])
    );
    if (cells.length >= 2 && cells[0] && cells[1]) specs[cells[0].toUpperCase()] = cells[1];
  }
  return specs;
}

function parseDetailTable(html) {
  const details = {};
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      stripTags(m[1])
    );
    for (let i = 0; i < cells.length - 1; i += 2) {
      if (cells[i] && cells[i + 1]) details[cells[i]] = cells[i + 1];
    }
  }
  return details;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

async function loadProducts() {
  const jsonPath = path.join(__dirname, "..", "..", "products.json");
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  }
  const res = await fetch("https://skltrucks.com/wp-json/wc/store/v1/products?per_page=50");
  return res.json();
}

async function main() {
  const raw = await loadProducts();
  let count = 0;

  for (const p of raw) {
    const summary = parseSummaryTable(p.short_description || "");
    const details = parseDetailTable(p.description || "");
    const images = [...new Set((p.images || []).map((i) => i.src))];
    const slug = p.slug;

    const row = {
      slug,
      name: decodeHtml(p.name),
      price: Number(p.prices?.price || 0) / 100,
      image: images[0] || "",
      images,
      categories: (p.categories || []).map((c) => c.name),
      category_slugs: (p.categories || []).map((c) => c.slug),
      type:
        (p.categories || []).find((c) =>
          ["sleeper-trucks", "day-cabs"].includes(c.slug) ||
          c.slug.includes("delivery-moving")
        )?.slug || "",
      cab_type:
        (p.categories || []).find((c) =>
          ["sleeper-trucks", "day-cabs"].includes(c.slug) ||
          c.slug.includes("delivery-moving")
        )?.slug || "",
      manufacturer: summary.MANUFACTURER || "",
      vin: summary.VIN || "",
      year: summary.YEAR || "",
      model: summary.MODEL || "",
      miles: summary.MILES || "",
      hours: summary.HOURS || "",
      condition: summary.CONDITION || "",
      details,
      published: true,
    };

    const { error } = await supabase.from("products").upsert(row, { onConflict: "slug" });
    if (error) console.error(`Failed ${slug}:`, error.message);
    else {
      count++;
      console.log(`✓ ${row.name.slice(0, 60)}...`);
    }
  }

  console.log(`\nSeeded ${count} products.`);
}

main();
