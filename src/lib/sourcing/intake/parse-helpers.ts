/** Shared numeric/bool parsers for intake mappers (no server-only). */

export function parseOptionalNumberFromText(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const cleaned = String(raw)
    .replace(/,/g, "")
    .replace(/\$/g, "")
    .replace(/\busd\b/gi, "")
    .replace(/\blbs?\b/gi, "")
    .replace(/\bmiles?\b/gi, "")
    .replace(/[^\d.-]/g, " ")
    .trim()
    .split(/\s+/)[0];
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseOptionalIntFromText(raw: string | undefined): number | null {
  const n = parseOptionalNumberFromText(raw);
  return n == null ? null : Math.round(n);
}

export function parseOptionalBoolFromText(raw: string | undefined): boolean | null {
  if (!raw?.trim()) return null;
  const v = raw.trim().toLowerCase();
  if (["yes", "true", "1", "y"].includes(v)) return true;
  if (["no", "false", "0", "n"].includes(v)) return false;
  return null;
}
