/**
 * Deterministic post-extraction rules that OpenAI (or any provider) cannot override.
 * Known non-Cummins engines and evidenced over-limit GVWR must reject —
 * never fall through as Needs verification.
 */

const CUMMINS_RE = /\bcummins\b/i;

/** Brands / families that are definitively not Cummins when named in listing text. */
const NON_CUMMINS_ENGINE_RE =
  /\b(paccar|px-?\s*7|px-?\s*9|detroit(?:\s+diesel)?|caterpillar|\bcat\b|maxxforce|power\s*stroke|duramax|navistar|isuzu|hino|mercedes(?:-|\s*)benz|mb\s*om\d|psi\b|ford\s*(?:godzilla|7\.3)|gm(?:c)?\s*(?:gas|v8))\b/i;

/**
 * Infer Cummins yes/no from evidenced engine text.
 * OpenAI's boolean is only used when the text is empty or brand-ambiguous.
 */
export function inferEngineIsCumminsFromText(
  engineText: string,
  claimed: boolean | null = null
): boolean | null {
  const blob = String(engineText || "").trim();
  if (!blob) return claimed;

  if (CUMMINS_RE.test(blob)) return true;
  if (NON_CUMMINS_ENGINE_RE.test(blob)) return false;

  // Ambiguous free text — do not invent; keep claim only if nullish text path unused
  return claimed;
}

/**
 * Apply deterministic engine flag using engine + evidence strings.
 * Known non-Cummins always wins over a null/true OpenAI claim.
 */
export function applyDeterministicEngineIsCummins(input: {
  engine?: string | null;
  engineEvidence?: string | null;
  engineIsCummins: boolean | null;
}): boolean | null {
  const text = [input.engine, input.engineEvidence].filter(Boolean).join(" ");
  return inferEngineIsCumminsFromText(text, input.engineIsCummins);
}
