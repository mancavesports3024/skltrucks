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
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    price: Number(row.price),
    image: row.image || images[0] || "",
    images: images.length ? images : row.image ? [row.image] : [],
    categories: row.categories ?? [],
    categorySlugs: row.category_slugs ?? [],
    type: row.type ?? "",
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
  return {
    slug,
    name: input.name,
    price: input.price,
    image: input.image || images[0] || "",
    images,
    categories: input.categories,
    category_slugs: input.categorySlugs,
    type: input.type,
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

export function buildCategoryFields(type: string, manufacturer: string) {
  const typeLabels: Record<string, string> = {
    "sleeper-trucks": "Sleeper Trucks",
    "day-cabs": "Day Cabs",
    "delivery-moving-straight-refrigerated-box-trucks":
      "DELIVERY / MOVING / STRAIGHT / REFRIGERATED BOX TRUCKS",
  };

  const categories: string[] = [];
  const categorySlugs: string[] = [];

  if (type && typeLabels[type]) {
    categories.push(typeLabels[type]);
    categorySlugs.push(type);
  }

  if (manufacturer) {
    const mfg =
      manufacturer.charAt(0).toUpperCase() + manufacturer.slice(1).toLowerCase();
    categories.push(mfg);
    if (type) {
      categorySlugs.push(`${manufacturer.toLowerCase()}-${type}`);
    }
  }

  return { categories, categorySlugs };
}
