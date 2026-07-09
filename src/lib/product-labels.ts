import { CAB_TYPES, MANUFACTURERS } from "@/lib/constants";

export function getCabTypeLabel(slug: string): string {
  return CAB_TYPES.find((c) => c.slug === slug)?.label ?? slug;
}

export function normalizeManufacturerSlug(value: string): string {
  const v = value.trim().toLowerCase();
  if (!v) return "";

  const bySlug = MANUFACTURERS.find((m) => m.slug === v);
  if (bySlug) return bySlug.slug;

  const byLabel = MANUFACTURERS.find((m) => m.label.toLowerCase() === v);
  if (byLabel) return byLabel.slug;

  return v.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function getManufacturerLabel(slug: string): string {
  const normalized = normalizeManufacturerSlug(slug);
  return MANUFACTURERS.find((m) => m.slug === normalized)?.label ?? slug;
}
