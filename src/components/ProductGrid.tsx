import type { Product } from "@/types/product";
import ProductCard from "./ProductCard";
import ProductGridLoading from "./ProductGridLoading";

interface ProductGridProps {
  products: Product[];
  /** How many leading cards are the LCP candidate. Only the first is high priority. */
  priorityCount?: number;
  /**
   * Shop and truck-sales. The visible first row loads eagerly for the current
   * column count; later cards stay lazy. High priority stays on card 1.
   */
  eagerFirstRow?: boolean;
}

const GRID_LOADING_SCRIPT = `(function(){
  if (window.__sklGridLoading) return;
  window.__sklGridLoading = true;
  var orig = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (name === "loading" && this.getAttribute && this.getAttribute("data-grid-index") != null) {
      var cols = 1;
      if (window.matchMedia("(min-width: 1280px)").matches) cols = 4;
      else if (window.matchMedia("(min-width: 1024px)").matches) cols = 3;
      else if (window.matchMedia("(min-width: 640px)").matches) cols = 2;
      var index = Number(this.getAttribute("data-grid-index"));
      if (!isNaN(index)) value = index < cols ? "eager" : "lazy";
    }
    return orig.call(this, name, value);
  };
})();`;

export default function ProductGrid({
  products,
  priorityCount = 0,
  eagerFirstRow = false,
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <p className="py-12 text-center text-neutral-500">No trucks found matching your filters.</p>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {eagerFirstRow ? (
        <>
          <script dangerouslySetInnerHTML={{ __html: GRID_LOADING_SCRIPT }} />
          <ProductGridLoading />
        </>
      ) : null}
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          gridIndex={eagerFirstRow ? index : undefined}
          priority={index === 0 && priorityCount > 0}
          eager={false}
        />
      ))}
    </div>
  );
}
