import { readFileSync } from "fs";
import path from "path";

/** Shared sales-sheet page CSS for PDF export (same file the site imports). */
export const SALES_SHEET_PAGE_CSS = readFileSync(
  path.join(process.cwd(), "src/styles/sales-sheet-page.css"),
  "utf8"
);
