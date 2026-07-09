export const CAB_TYPES = [
  { label: "Day Cabs", slug: "day-cabs" },
  {
    label: "DELIVERY / MOVING / STRAIGHT / REFRIGERATED BOX TRUCKS",
    slug: "delivery-moving-straight-refrigerated-box-trucks",
  },
  { label: "Sleeper", slug: "sleeper-trucks" },
];

export const MANUFACTURERS = [
  { label: "Freightliner", slug: "freightliner" },
  { label: "Hino", slug: "hino" },
  { label: "International", slug: "international" },
  { label: "Isuzu", slug: "isuzu" },
  { label: "Kenworth", slug: "kenworth" },
  { label: "Mack", slug: "mack" },
  { label: "Peterbilt", slug: "peterbilt" },
  { label: "Volvo", slug: "volvo" },
];

export function normalizeManufacturerSlug(value) {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return "";

  const bySlug = MANUFACTURERS.find((m) => m.slug === v);
  if (bySlug) return bySlug.slug;

  const byLabel = MANUFACTURERS.find((m) => m.label.toLowerCase() === v);
  if (byLabel) return byLabel.slug;

  return v.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function getCabTypeFromCategories(categories) {
  const slugs = (categories || []).map((c) => c.slug);
  return (
    slugs.find((s) => s === "sleeper-trucks") ||
    slugs.find((s) => s === "day-cabs") ||
    slugs.find((s) => s.includes("delivery-moving")) ||
    ""
  );
}

export function buildCategoryFields(cabType, manufacturer) {
  const categories = [];
  const categorySlugs = [];

  const cabEntry = CAB_TYPES.find((c) => c.slug === cabType);
  if (cabEntry) {
    categories.push(cabEntry.label);
    categorySlugs.push(cabEntry.slug);
  }

  const mfgSlug = normalizeManufacturerSlug(manufacturer);
  if (mfgSlug) {
    const mfgEntry = MANUFACTURERS.find((m) => m.slug === mfgSlug);
    categories.push(mfgEntry?.label ?? manufacturer);
    if (cabType) {
      categorySlugs.push(`${mfgSlug}-${cabType}`);
    }
  }

  return { categories, categorySlugs };
}
