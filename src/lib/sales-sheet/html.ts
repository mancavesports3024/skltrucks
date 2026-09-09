import { SITE } from "@/lib/constants";
import {
  buildSalesSheetRows,
  splitAddressLines,
} from "@/components/ProductPrintSheet";
import { formatPrice } from "@/lib/inventory";
import { sanitizeImageUrl } from "@/lib/image-urls";
import { SALES_SHEET_PAGE_CSS } from "@/lib/sales-sheet/styles";
import type { Product } from "@/types/product";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toAbsoluteUrl(url: string, origin: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return `${origin}/${trimmed}`;
}

function rowsHtml(rows: [string, string][]): string {
  return rows
    .map(
      ([label, value]) => `
        <div class="sales-sheet-row">
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>`
    )
    .join("");
}

function sectionHtml(title: string, rows: [string, string][]): string {
  if (!rows.length) return "";
  return `
    <section class="sales-sheet-section">
      <h2>${escapeHtml(title)}</h2>
      <dl class="sales-sheet-grid">${rowsHtml(rows)}</dl>
    </section>`;
}

/**
 * Build the sales-sheet HTML document for PDF export.
 * Mirrors ProductPrintSheet markup and shared page CSS.
 */
export function buildSalesSheetHtml(options: {
  product: Product;
  details: [string, string][];
  phone?: string;
  email?: string;
  address?: string;
  origin: string;
}): string {
  const product = options.product;
  const phone = options.phone ?? SITE.phone;
  const address = options.address ?? SITE.address;
  const origin = options.origin;

  const mainImage = sanitizeImageUrl(
    product.image || (product.images.length ? product.images[0] : "")
  );
  const absoluteImage = mainImage ? toAbsoluteUrl(mainImage, origin) : "";
  const logoUrl = toAbsoluteUrl(SITE.logo, origin);
  const addressLines = splitAddressLines(address);
  const { specs, warranty, otherDetails } = buildSalesSheetRows(product, options.details);
  const comments = product.comments?.trim() ?? "";

  const addressHtml = addressLines
    .map((line) => `<p class="sales-sheet-address">${escapeHtml(line)}</p>`)
    .join("");

  const photoHtml = absoluteImage
    ? `<img src="${escapeHtml(absoluteImage)}" alt="${escapeHtml(product.name)}" class="sales-sheet-photo" />`
    : `<div class="sales-sheet-photo-empty">No photo</div>`;

  const commentsHtml = comments
    ? `<section class="sales-sheet-section">
        <h2>Comments</h2>
        <p class="sales-sheet-comments">${escapeHtml(comments)}</p>
      </section>`
    : "";

  const body = `
    <article class="sales-sheet-page" data-sales-sheet="true">
      <header class="sales-sheet-header">
        <div class="sales-sheet-header-left">
          <div class="sales-sheet-logo-wrap">
            <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(SITE.name)}" class="sales-sheet-logo" />
          </div>
        </div>
        <div class="sales-sheet-header-center">
          <p class="sales-sheet-company">${escapeHtml(SITE.name)}</p>
          <p class="sales-sheet-phone">${escapeHtml(phone)}</p>
        </div>
        <div class="sales-sheet-header-right">${addressHtml}</div>
      </header>

      <div class="sales-sheet-title-row">
        <h1 class="sales-sheet-title">${escapeHtml(product.name)}</h1>
        <p class="sales-sheet-price">${escapeHtml(formatPrice(product.price))}</p>
      </div>

      <div class="sales-sheet-photo-frame">${photoHtml}</div>

      ${sectionHtml("Specifications", specs)}
      ${sectionHtml("Warranty", warranty)}
      ${commentsHtml}
      ${sectionHtml("Details", otherDetails)}
    </article>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(product.name)}</title>
    <style>${SALES_SHEET_PAGE_CSS}</style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}
