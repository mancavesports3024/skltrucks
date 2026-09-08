import { SITE } from "@/lib/constants";
import { formatPrice } from "@/lib/inventory";
import { getCabTypeLabel, getManufacturerLabel } from "@/lib/product-labels";
import { sanitizeImageUrl } from "@/lib/image-urls";
import type { Product } from "@/types/product";

/** Split "4000 W 7th St. Joplin, Mo. 64801" into street + city lines. */
function splitAddressLines(address?: string): string[] {
  const value = (address ?? "").trim();
  if (!value) return [];

  const streetMatch = value.match(/^(.+?\.)\s+(.+)$/);
  if (streetMatch) {
    return [streetMatch[1], streetMatch[2]];
  }

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

interface ProductPrintSheetProps {
  product: Product;
  details: [string, string][];
  phone?: string;
  email?: string;
  address?: string;
  /** Show on screen (admin print preview). Default is print-only. */
  forceVisible?: boolean;
}

export default function ProductPrintSheet({
  product,
  details,
  phone = SITE.phone,
  address = SITE.address,
  forceVisible = false,
}: ProductPrintSheetProps) {
  const mainImage = sanitizeImageUrl(
    product.image || (product.images.length ? product.images[0] : "")
  );

  const specs: [string, string][] = [
    ["Cab Type", product.cabType ? getCabTypeLabel(product.cabType) : "—"],
    ["VIN", product.vin || "—"],
    ["Year", product.year || "—"],
    ["Manufacturer", product.manufacturer ? getManufacturerLabel(product.manufacturer) : "—"],
    ["Model", product.model || "—"],
    ["Miles", product.miles || "—"],
    ["Hours", product.hours || "—"],
    ...(product.condition ? [["Condition", product.condition] as [string, string]] : []),
    ["Price", formatPrice(product.price)],
  ];

  const addressLines = splitAddressLines(address);

  return (
    <div className={forceVisible ? "product-print-sheet block" : "product-print-sheet hidden print:block"}>
      <header className="print-sheet-header">
        <div className="print-sheet-header-left">
          <div className="print-sheet-logo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SITE.logo} alt={SITE.name} className="print-sheet-logo" />
          </div>
        </div>
        <div className="print-sheet-header-center">
          <p className="print-sheet-company">{SITE.name}</p>
          <p className="print-sheet-phone">{phone}</p>
        </div>
        <div className="print-sheet-header-right">
          {addressLines.map((line) => (
            <p key={line} className="print-sheet-address">
              {line}
            </p>
          ))}
        </div>
      </header>

      <h1 className="print-sheet-title">{product.name}</h1>

      {mainImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mainImage} alt={product.name} className="print-sheet-photo" />
      ) : (
        <div className="print-sheet-photo-empty">No photo</div>
      )}

      <section className="print-sheet-section">
        <h2>Specifications</h2>
        <dl className="print-sheet-grid">
          {specs.map(([label, value]) => (
            <div key={label} className="print-sheet-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {product.comments?.trim() ? (
        <section className="print-sheet-section">
          <h2>Comments</h2>
          <p className="print-sheet-comments">{product.comments.trim()}</p>
        </section>
      ) : null}

      {details.length > 0 ? (
        <section className="print-sheet-section">
          <h2>Details</h2>
          <dl className="print-sheet-grid">
            {details.map(([label, value]) => (
              <div key={label} className="print-sheet-row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {product.categories.length > 0 ? (
        <p className="print-sheet-categories">{product.categories.join(", ")}</p>
      ) : null}
    </div>
  );
}
