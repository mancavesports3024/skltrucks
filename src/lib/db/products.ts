import { CAB_TYPES, MANUFACTURERS } from "@/lib/constants";
import type { Product, ProductInput } from "@/types/product";

interface DbProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  image: string | null;
  images: string[] | null;
  categories: string[] | null;
  category_slugs: string[] | null;
  cab_type: string | null;
  type: string | null;
  manufacturer: string | null;
  vin: string | null;
  year: string | null;
  model: string | null;
  miles: string | null;
  hours: string | null;
  condition: string | null;
  details: Record<string, string> | null;
  published: boolean;
}

export function rowToProduct(row: DbProduct): Product {
  const images = row.images?.filter(Boolean) ?? [];
  const cabType = row.cab_type || row.type || "";

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    price: Number(row.price),
    image: row.image || images[0] || "",
    images: images.length ? images : row.image ? [row.image] : [],
    categories: row.categories ?? [],
    categorySlugs: row.category_slugs ?? [],
    cabType,
    type: cabType,
    manufacturer: row.manufacturer ?? "",
    vin: row.vin ?? "",
    year: row.year ?? "",
    model: row.model ?? "",
    miles: row.miles ?? "",
    hours: row.hours ?? "",
    condition: row.condition ?? "",
    details: row.details ?? {},
    published: row.published,
  };
}

export function inputToRow(input: ProductInput, slug: string) {
  const images = input.images.length ? input.images : input.image ? [input.image] : [];
  const cabType = input.cabType || input.type || "";

  return {
    slug,
    name: input.name,
    price: input.price,
    image: input.image || images[0] || "",
    images,
    categories: input.categories,
    category_slugs: input.categorySlugs,
    cab_type: cabType,
    type: cabType,
    manufacturer: input.manufacturer,
    vin: input.vin,
    year: input.year,
    model: input.model,
    miles: input.miles,
    hours: input.hours,
    condition: input.condition,
    details: input.details,
    published: input.published,
  };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function buildCategoryFields(cabType: string, manufacturer: string) {
  const categories: string[] = [];
  const categorySlugs: string[] = [];

  const cabEntry = CAB_TYPES.find((c) => c.slug === cabType);
  if (cabEntry) {
    categories.push(cabEntry.label);
    categorySlugs.push(cabEntry.slug);
  }

  if (manufacturer) {
    const mfgSlug = manufacturer.toLowerCase();
    const mfgEntry = MANUFACTURERS.find((m) => m.slug === mfgSlug);
    categories.push(mfgEntry?.label ?? manufacturer);
    if (cabType) {
      categorySlugs.push(`${mfgSlug}-${cabType}`);
    }
  }

  return { categories, categorySlugs };
}
