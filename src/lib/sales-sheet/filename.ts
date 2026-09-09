import { getManufacturerLabel } from "@/lib/product-labels";
import type { Product } from "@/types/product";

function slugPart(value: string): string {
  return value
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function findStockNumber(product: Product): string {
  const details = product.details ?? {};
  const keys = Object.keys(details);
  const match = keys.find((key) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return (
      normalized === "stocknumber" ||
      normalized === "stockno" ||
      normalized === "stock" ||
      normalized === "stocknum"
    );
  });
  return match ? String(details[match] ?? "").trim() : "";
}

/** Build a download filename like SKL-Trucks-2018-Freightliner-M2.pdf */
export function buildSalesSheetFilename(product: Product): string {
  const parts = ["SKL-Trucks"];
  const stock = findStockNumber(product);
  if (stock) {
    parts.push(stock);
  }

  if (product.year) parts.push(product.year);

  const manufacturer = product.manufacturer
    ? getManufacturerLabel(product.manufacturer)
    : "";
  if (manufacturer) parts.push(manufacturer);

  if (product.model) parts.push(product.model);

  if (parts.length === 1) {
    parts.push(product.slug || product.id);
  }

  const base = parts.map(slugPart).filter(Boolean).join("-");
  return `${base || "SKL-Trucks-sales-sheet"}.pdf`;
}
