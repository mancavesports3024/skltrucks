import { SITE } from "@/lib/constants";
import { formatPrice } from "@/lib/inventory";
import { getCabTypeLabel, getManufacturerLabel } from "@/lib/product-labels";
import { sanitizeImageUrl } from "@/lib/image-urls";
import type { Product } from "@/types/product";

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
  email = SITE.email,
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

  return (
    <div className={forceVisible ? "product-print-sheet block" : "product-print-sheet hidden print:block"}>
      <header className="print-sheet-header">
        <div className="print-sheet-header-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SITE.logo} alt={SITE.name} className="print-sheet-logo" />
        </div>
        <div className="print-sheet-header-center">
          <p className="print-sheet-company">{SITE.name}</p>
          <p className="print-sheet-phone">{phone}</p>
          {email ? <p className="print-sheet-meta">{email}</p> : null}
        </div>
        <div className="print-sheet-header-right">
          {address ? <p className="print-sheet-address">{address}</p> : null}
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
