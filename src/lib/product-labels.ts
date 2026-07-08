import { CAB_TYPES, MANUFACTURERS } from "@/lib/constants";

export function getCabTypeLabel(slug: string): string {
  return CAB_TYPES.find((c) => c.slug === slug)?.label ?? slug;
}

export function getManufacturerLabel(slug: string): string {
  const normalized = slug.toLowerCase();
  return MANUFACTURERS.find((m) => m.slug === normalized)?.label ?? slug;
}
