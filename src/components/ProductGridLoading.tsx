"use client";

import { useLayoutEffect } from "react";

function columnCount(): number {
  if (window.matchMedia("(min-width: 1280px)").matches) return 4;
  if (window.matchMedia("(min-width: 1024px)").matches) return 3;
  if (window.matchMedia("(min-width: 640px)").matches) return 2;
  return 1;
}

/** Keeps the first row eager after hydration and when the viewport changes. */
export default function ProductGridLoading() {
  useLayoutEffect(() => {
    const apply = () => {
      const cols = columnCount();
      document.querySelectorAll<HTMLImageElement>("img[data-grid-index]").forEach((img) => {
        const index = Number(img.dataset.gridIndex);
        if (Number.isNaN(index)) return;
        const next = index < cols ? "eager" : "lazy";
        if (img.loading !== next) img.loading = next;
      });
    };

    apply();
    const queries = ["(min-width: 1280px)", "(min-width: 1024px)", "(min-width: 640px)"].map((query) =>
      window.matchMedia(query)
    );
    queries.forEach((query) => query.addEventListener("change", apply));
    return () => queries.forEach((query) => query.removeEventListener("change", apply));
  }, []);

  return null;
}
