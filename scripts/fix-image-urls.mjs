/**
 * Remove stray \\r characters from product image URLs in Supabase.
 * These were saved when Windows-style line endings split URLs on save.
 *
 * Usage: npm run fix-image-urls
 * Requires .env.local with Supabase keys.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

function sanitizeImageUrl(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n]+/g, "").trim();
}

function sanitizeImageUrls(values) {
  if (!Array.isArray(values)) return [];
  return values.map(sanitizeImageUrl).filter(Boolean);
}

async function main() {
  const { data: products, error } = await supabase.from("products").select("id, slug, image, images");

  if (error) {
    console.error("Failed to load products:", error.message);
    process.exit(1);
  }

  let updated = 0;

  for (const product of products ?? []) {
    const image = sanitizeImageUrl(product.image);
    const images = sanitizeImageUrls(product.images);
    const normalizedImages = images.length ? images : image ? [image] : [];

    const changed =
      image !== (product.image ?? "") ||
      JSON.stringify(normalizedImages) !== JSON.stringify(product.images ?? []);

    if (!changed) continue;

    const { error: updateError } = await supabase
      .from("products")
      .update({
        image,
        images: normalizedImages,
      })
      .eq("id", product.id);

    if (updateError) {
      console.error(`Failed ${product.slug}:`, updateError.message);
      continue;
    }

    updated += 1;
    console.log(`✓ ${product.slug}`);
  }

  console.log(`\nFixed ${updated} product(s).`);
}

main();
