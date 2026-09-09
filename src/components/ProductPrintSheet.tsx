import { SITE } from "@/lib/constants";
import { formatPrice } from "@/lib/inventory";
import { getCabTypeLabel, getManufacturerLabel } from "@/lib/product-labels";
import { sanitizeImageUrl } from "@/lib/image-urls";
import type { Product } from "@/types/product";

const EMPTY = new Set(["", "—", "-", "n/a", "na", "none"]);

/** Split "4000 W 7th St. Joplin, Mo. 64801" into street + city lines. */
export function splitAddressLines(address?: string): string[] {
  const value = (address ?? "").trim();
  if (!value) return [];

  const streetMatch = value.match(/^(.+?\.)\s+(.+)$/);
  if (streetMatch) return [streetMatch[1], streetMatch[2]];

  const comma = value.indexOf(",");
  if (comma > 0) {
    const before = value.slice(0, comma).trim();
    const after = value.slice(comma + 1).trim();
    const lastSpace = before.lastIndexOf(" ");
    if (lastSpace > 0) {
      return [`${before.slice(0, lastSpace)}`, `${before.slice(lastSpace + 1)}, ${after}`];
    }
    return [before, after];
  }

  return [value];
}

function hasValue(value: string | undefined | null): boolean {
  if (value == null) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  return !EMPTY.has(trimmed.toLowerCase());
}

function isWarrantyKey(key: string): boolean {
  return /^warranty/i.test(key.trim());
}

export function buildSalesSheetRows(product: Product, details: [string, string][]) {
  const specs: [string, string][] = (
    [
      ["Cab Type", product.cabType ? getCabTypeLabel(product.cabType) : ""],
      ["VIN", product.vin],
      ["Year", product.year],
      ["Manufacturer", product.manufacturer ? getManufacturerLabel(product.manufacturer) : ""],
      ["Model", product.model],
      ["Miles", product.miles],
      ["Hours", product.hours],
      ["Condition", product.condition],
    ] as [string, string][]
  ).filter(([, value]) => hasValue(value));

  const warranty: [string, string][] = [];
  const otherDetails: [string, string][] = [];

  for (const [label, value] of details) {
    if (!hasValue(value)) continue;
    if (isWarrantyKey(label)) warranty.push([label, value.trim()]);
    else otherDetails.push([label, value.trim()]);
  }

  return { specs, warranty, otherDetails };
}

interface ProductPrintSheetProps {
  product: Product;
  details: [string, string][];
  phone?: string;
  email?: string;
  address?: string;
}

/**
 * Fixed US Letter (8.5 × 11 in) sales sheet.
 * Preview scaling must wrap this element — do not transform this node for print.
 */
export default function ProductPrintSheet({
  product,
  details,
  phone = SITE.phone,
  address = SITE.address,
}: ProductPrintSheetProps) {
  const mainImage = sanitizeImageUrl(
    product.image || (product.images.length ? product.images[0] : "")
  );
  const addressLines = splitAddressLines(address);
  const { specs, warranty, otherDetails } = buildSalesSheetRows(product, details);
  const comments = product.comments?.trim() ?? "";

  return (
    <article className="sales-sheet-page" data-sales-sheet="true">
      <header className="sales-sheet-header">
        <div className="sales-sheet-header-left">
          <div className="sales-sheet-logo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SITE.logo} alt={SITE.name} className="sales-sheet-logo" />
          </div>
        </div>
        <div className="sales-sheet-header-center">
          <p className="sales-sheet-company">{SITE.name}</p>
          <p className="sales-sheet-phone">{phone}</p>
        </div>
        <div className="sales-sheet-header-right">
          {addressLines.map((line) => (
            <p key={line} className="sales-sheet-address">
              {line}
            </p>
          ))}
        </div>
      </header>

      <div className="sales-sheet-title-row">
        <h1 className="sales-sheet-title">{product.name}</h1>
        <p className="sales-sheet-price">{formatPrice(product.price)}</p>
      </div>

      <div className="sales-sheet-photo-frame">
        {mainImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mainImage} alt={product.name} className="sales-sheet-photo" />
        ) : (
          <div className="sales-sheet-photo-empty">No photo</div>
        )}
      </div>

      {specs.length > 0 ? (
        <section className="sales-sheet-section">
          <h2>Specifications</h2>
          <dl className="sales-sheet-grid">
            {specs.map(([label, value]) => (
              <div key={label} className="sales-sheet-row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {warranty.length > 0 ? (
        <section className="sales-sheet-section">
          <h2>Warranty</h2>
          <dl className="sales-sheet-grid">
            {warranty.map(([label, value]) => (
              <div key={label} className="sales-sheet-row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {comments ? (
        <section className="sales-sheet-section">
          <h2>Comments</h2>
          <p className="sales-sheet-comments">{comments}</p>
        </section>
      ) : null}

      {otherDetails.length > 0 ? (
        <section className="sales-sheet-section">
          <h2>Details</h2>
          <dl className="sales-sheet-grid">
            {otherDetails.map(([label, value]) => (
              <div key={label} className="sales-sheet-row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </article>
  );
}
