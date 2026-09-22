/** Hard limits for staff-reviewed workbook intake (server-side only). */
export const WORKBOOK_MAX_BYTES = 8 * 1024 * 1024; // 8 MiB
export const WORKBOOK_MAX_ROWS = 2_000;
export const WORKBOOK_MAX_SHEETS_SCANNED = 40;

export const WORKBOOK_ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx"] as const;