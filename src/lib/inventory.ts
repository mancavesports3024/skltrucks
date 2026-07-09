import { products as staticProducts } from "@/data/inventory";
import { rowToProduct } from "@/lib/db/products";
import { normalizeManufacturerSlug } from "@/lib/product-labels";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/types/product";

export const revalidate = 30;

async function fetchPublicFromDb(): Promise<Product[] | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[inventory] Supabase error:", error.message);
      return null;
    }

    return (data ?? []).map(rowToProduct);
  } catch (err) {
    console.error("[inventory] fetch error:", err);
    return null;
  }
}

async function fetchAdminFromDb(): Promise<Product[] | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[inventory] Supabase admin error:", error.message);
      return null;
    }

    return (data ?? []).map(rowToProduct);
  } catch (err) {
    console.error("[inventory] admin fetch error:", err);
    return null;
  }
}

function staticAsProducts(): Product[] {
  return staticProducts.map((p) => ({
    ...p,
    id: String(p.id),
    cabType: p.cabType ?? p.type ?? "",
    type: p.cabType ?? p.type ?? "",
  }));
}

export async function getAllProducts(): Promise<Product[]> {
  const db = await fetchPublicFromDb();
  if (!db || db.length === 0) return staticAsProducts();
  return db;
}

export async function getAllProductsAdmin(): Promise<Product[]> {
  if (!isSupabaseConfigured()) {
    return staticAsProducts();
  }

  const db = await fetchAdminFromDb();
  return db ?? [];
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createPublicClient();
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("slug", slug)
        .eq("published", true)
        .single();

      if (!error && data) return rowToProduct(data);
    } catch {
      // fall through to static
    }
  }

  return staticAsProducts().find((p) => p.slug === slug);
}

export async function getProductById(id: string): Promise<Product | undefined> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
      if (!error && data) return rowToProduct(data);
      return undefined;
    } catch {
      return undefined;
    }
  }

  return staticAsProducts().find((p) => p.id === id);
}

export async function filterProducts(options: {
  category?: string;
  manufacturer?: string;
  sort?: string;
}): Promise<Product[]> {
  let result = [...(await getAllProducts())];

  if (options.category) {
    result = result.filter(
      (p) =>
        p.cabType === options.category ||
        p.type === options.category ||
        p.categorySlugs.some((s) => s.includes(options.category!))
    );
  }

  if (options.manufacturer) {
    const filterSlug = normalizeManufacturerSlug(options.manufacturer);
    result = result.filter(
      (p) => normalizeManufacturerSlug(p.manufacturer) === filterSlug
    );
  }

  switch (options.sort) {
    case "price-asc":
      result.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      result.sort((a, b) => b.price - a.price);
      break;
    case "year-desc":
      result.sort((a, b) => Number(b.year) - Number(a.year));
      break;
    default:
      break;
  }

  return result;
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}
