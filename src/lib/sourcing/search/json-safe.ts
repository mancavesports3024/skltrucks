/**
 * Narrow JSON cleanup for model output. Does not invent or rewrite truck facts.
 * Only removes trailing commas outside strings before JSON.parse.
 */
export function stripTrailingCommasOutsideStrings(input: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      out += ch;
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      if (j < input.length && (input[j] === "}" || input[j] === "]")) {
        // skip trailing comma
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** Safe truncation for server logs — never dump full model payloads. */
export function truncateForLog(raw: string, maxChars = 400): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}…[truncated ${s.length - maxChars} chars]`;
}

export type JsonParseAttempt = {
  value: Record<string, unknown>;
  usedTrailingCommaCleanup: boolean;
};

/**
 * Extract and parse a JSON object from model text.
 * Applies trailing-comma cleanup only after a direct parse fails.
 * Does not strip comments, unquote keys, or repair truncated JSON.
 */
export function parseModelJsonObject(raw: string): JsonParseAttempt {
  const trimmed = String(raw ?? "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new SyntaxError("Model did not return JSON object.");
  }
  const slice = jsonText.slice(start, end + 1);
  try {
    return {
      value: JSON.parse(slice) as Record<string, unknown>,
      usedTrailingCommaCleanup: false,
    };
  } catch (first) {
    const cleaned = stripTrailingCommasOutsideStrings(slice);
    if (cleaned === slice) throw first;
    try {
      return {
        value: JSON.parse(cleaned) as Record<string, unknown>,
        usedTrailingCommaCleanup: true,
      };
    } catch {
      throw first;
    }
  }
}
