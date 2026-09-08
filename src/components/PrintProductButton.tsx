"use client";

export default function PrintProductButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex min-h-12 items-center justify-center border-2 border-neutral-800 px-8 py-3 text-center text-sm font-semibold uppercase text-neutral-800 transition-colors hover:bg-neutral-800 hover:text-white print:hidden"
    >
      Print
    </button>
  );
}
