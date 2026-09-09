"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const LETTER_WIDTH_IN = 8.5;
const LETTER_HEIGHT_IN = 11;
const FALLBACK_PX_PER_IN = 96;

type PreviewMode = "fit" | "100";

interface SalesSheetPreviewProps {
  productId: string;
  downloadFileName: string;
  backHref: string;
  editHref: string;
  children: ReactNode;
}

async function waitForSheetAssets(root: HTMLElement) {
  await document.fonts.ready.catch(() => undefined);

  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        })
    )
  );
}

export default function SalesSheetPreview({
  productId,
  downloadFileName,
  backHref,
  editHref,
  children,
}: SalesSheetPreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sheetHostRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<PreviewMode>("fit");
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [sheetSize, setSheetSize] = useState({
    width: LETTER_WIDTH_IN * FALLBACK_PX_PER_IN,
    height: LETTER_HEIGHT_IN * FALLBACK_PX_PER_IN,
  });

  const measureOverflow = useCallback(() => {
    const sheet = sheetHostRef.current?.querySelector<HTMLElement>("[data-sales-sheet='true']");
    if (!sheet) {
      setOverflow(false);
      return;
    }
    setOverflow(sheet.scrollHeight > sheet.clientHeight + 1);
  }, []);

  const updateScale = useCallback(() => {
    const viewport = viewportRef.current;
    const sheet = sheetHostRef.current?.querySelector<HTMLElement>("[data-sales-sheet='true']");
    if (!viewport || !sheet) return;

    const width = sheet.offsetWidth || LETTER_WIDTH_IN * FALLBACK_PX_PER_IN;
    const height = sheet.offsetHeight || LETTER_HEIGHT_IN * FALLBACK_PX_PER_IN;
    setSheetSize({ width, height });

    if (mode === "100") {
      setScale(1);
      return;
    }

    const pad = 24;
    const availableW = Math.max(120, viewport.clientWidth - pad);
    const availableH = Math.max(120, viewport.clientHeight - pad);
    const next = Math.min(availableW / width, availableH / height, 1);
    setScale(Number.isFinite(next) && next > 0 ? next : 1);
  }, [mode]);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      const host = sheetHostRef.current;
      if (!host) return;
      await waitForSheetAssets(host);
      if (cancelled) return;
      setReady(true);
      requestAnimationFrame(() => {
        updateScale();
        measureOverflow();
      });
    }

    prepare();
    return () => {
      cancelled = true;
    };
  }, [measureOverflow, updateScale]);

  useLayoutEffect(() => {
    updateScale();
    measureOverflow();
  }, [mode, ready, updateScale, measureOverflow]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onResize = () => {
      updateScale();
      measureOverflow();
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(viewport);
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [updateScale, measureOverflow]);

  function handlePrint() {
    if (!ready || pdfLoading) return;
    window.print();
  }

  async function handleDownloadPdf() {
    if (!ready || pdfLoading) return;
    setPdfError("");
    setPdfLoading(true);

    try {
      const response = await fetch(`/api/admin/products/${productId}/pdf`, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/pdf" },
      });

      if (!response.ok) {
        let message = "Could not download PDF. Please try again.";
        try {
          const data = (await response.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          // keep default message
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadFileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Could not download PDF.");
    } finally {
      setPdfLoading(false);
    }
  }

  const scaledWidth = sheetSize.width * scale;
  const scaledHeight = sheetSize.height * scale;

  return (
    <div className="sales-sheet-preview-root">
      <div className="sales-sheet-chrome">
        <div className="sales-sheet-chrome-bar">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={backHref} className="font-medium hover:text-[#fc0527]">
              ← Inventory
            </Link>
            <Link href={editHref} className="font-medium hover:text-[#fc0527]">
              Edit truck
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("fit")}
              className={`sales-sheet-chrome-btn ${mode === "fit" ? "is-active" : ""}`}
            >
              Fit page
            </button>
            <button
              type="button"
              onClick={() => setMode("100")}
              className={`sales-sheet-chrome-btn ${mode === "100" ? "is-active" : ""}`}
            >
              100%
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!ready || pdfLoading}
              className="sales-sheet-chrome-btn sales-sheet-chrome-btn-print"
            >
              {ready ? "Print" : "Loading…"}
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!ready || pdfLoading}
              className="sales-sheet-chrome-btn sales-sheet-chrome-btn-download"
            >
              {pdfLoading ? "Preparing PDF…" : "Download PDF"}
            </button>
          </div>
        </div>

        {pdfError ? (
          <div className="sales-sheet-error-banner" role="alert">
            {pdfError}
          </div>
        ) : null}

        {overflow ? (
          <div className="sales-sheet-overflow-banner" role="status">
            This sales sheet may not fit on one US Letter page with the current content. Review
            long title, comments, or detail fields before printing — nothing was removed
            automatically.
          </div>
        ) : null}
      </div>

      <div ref={viewportRef} className="sales-sheet-viewport">
        <div
          className="sales-sheet-scale-slot"
          style={{ width: scaledWidth, height: scaledHeight }}
        >
          <div
            ref={sheetHostRef}
            className="sales-sheet-scale-inner"
            style={{
              width: sheetSize.width,
              height: sheetSize.height,
              transform: `scale(${scale})`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
