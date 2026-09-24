import "server-only";

import { GOOGLE_ROUTES_PROVIDER } from "@/lib/sourcing/distance/google-routes/types";

export const GOOGLE_ROUTES_FAILED_EVENT = "google_routes_failed" as const;

export type GoogleRoutesFailureStage =
  | "request"
  | "response_validation"
  | "cache_persistence";

/** Only these keys are ever emitted to logs. */
export type GoogleRoutesFailedLog = {
  event: typeof GOOGLE_ROUTES_FAILED_EVENT;
  httpStatus: number | null;
  googleErrorStatus: string | null;
  googleErrorReason: string | null;
  googleErrorMessage: string | null;
  failureStage: GoogleRoutesFailureStage;
  vercelEnv: string;
  provider: typeof GOOGLE_ROUTES_PROVIDER;
};

const MAX_ENUM_LEN = 64;
const MAX_MESSAGE_LEN = 200;

/** Google-style STATUS / reason tokens only (no free text, no secrets). */
const SAFE_ENUM = /^[A-Z][A-Z0-9_.]{0,63}$/;

/**
 * Patterns that must never appear in diagnostic fields (keys, auth material, coords payloads).
 * Applied after length truncation so redaction still catches mid-string secrets.
 */
const SECRETISH =
  /(?:X-Goog-Api-Key|Authorization|Cookie|Set-Cookie|GOOGLE_MAPS_ROUTES_API_KEY)\s*:\s*\S+|AIza[0-9A-Za-z_-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|key=[^&\s"']+|api[_-]?key\s*[=:]\s*[^\s"',}]+/gi;

const URLISH = /https?:\/\/[^\s"'<>]+/gi;

const LEAD_IDISH = /\blead-[0-9a-f]{8}-[0-9a-f-]+\b/gi;

export function resolveVercelEnv(env: NodeJS.ProcessEnv = process.env): string {
  const v = String(env.VERCEL_ENV ?? "").trim();
  if (v === "production" || v === "preview" || v === "development") return v;
  if (String(env.NODE_ENV ?? "").trim() === "test") return "test";
  return "unknown";
}

function redactSecrets(raw: string): string {
  return raw
    .replace(SECRETISH, "[REDACTED]")
    .replace(URLISH, "[URL]")
    .replace(LEAD_IDISH, "[REDACTED]")
    // Never echo coordinate pairs that Google (or us) might embed in messages.
    .replace(/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, "[COORDS]");
}

/** Sanitize Google error `status` / `reason` enums for logs. */
export function sanitizeGoogleErrorEnum(raw: unknown): string | null {
  if (raw == null) return null;
  const s = redactSecrets(String(raw).trim()).slice(0, MAX_ENUM_LEN);
  if (!s || !SAFE_ENUM.test(s)) return null;
  return s;
}

/** Sanitize Google error `message` — short, no keys/URLs/headers. */
export function sanitizeGoogleErrorMessage(raw: unknown): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = redactSecrets(s)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .slice(0, MAX_MESSAGE_LEN)
    .trim();
  if (!s) return null;
  // Second pass after truncation (secret straddling the cut).
  s = redactSecrets(s);
  // Avoid sticky-regex false negatives from prior .test calls.
  if (
    /AIza[0-9A-Za-z_-]{10,}|Bearer\s+\S+|eyJ[A-Za-z0-9_-]{20,}\.|X-Goog-Api-Key|GOOGLE_MAPS_ROUTES_API_KEY|Authorization\s*:|Cookie\s*:|lead-[0-9a-f]{8}-/i.test(
      s
    )
  ) {
    return "[REDACTED]";
  }
  return s;
}

/**
 * Pull Google error.status / reason / message from a parsed error JSON body.
 * Never returns raw body, headers, or coordinates.
 */
export function extractGoogleErrorFields(json: unknown): {
  status: string | null;
  reason: string | null;
  message: string | null;
} {
  if (!json || typeof json !== "object") {
    return { status: null, reason: null, message: null };
  }

  const err = (json as { error?: unknown }).error;
  const root = err && typeof err === "object" ? (err as Record<string, unknown>) : (json as Record<string, unknown>);

  const status = sanitizeGoogleErrorEnum(root.status);
  const message = sanitizeGoogleErrorMessage(root.message);

  let reason: string | null = null;
  const details = root.details;
  if (Array.isArray(details)) {
    for (const d of details) {
      if (!d || typeof d !== "object") continue;
      const r = sanitizeGoogleErrorEnum((d as { reason?: unknown }).reason);
      if (r) {
        reason = r;
        break;
      }
    }
  }
  if (!reason) {
    reason = sanitizeGoogleErrorEnum(root.reason);
  }

  return { status, reason, message };
}

/**
 * Bound+parse an error response text for diagnostics only.
 * Caps size before parse; never logs the raw text.
 */
export function parseGoogleErrorResponseText(rawText: string): {
  status: string | null;
  reason: string | null;
  message: string | null;
} {
  const capped = rawText.length > 8_192 ? rawText.slice(0, 8_192) : rawText;
  try {
    return extractGoogleErrorFields(JSON.parse(capped) as unknown);
  } catch {
    return { status: null, reason: null, message: null };
  }
}

export type LogGoogleRoutesFailureInput = {
  httpStatus: number | null;
  googleErrorStatus?: string | null;
  googleErrorReason?: string | null;
  googleErrorMessage?: string | null;
  failureStage: GoogleRoutesFailureStage;
  env?: NodeJS.ProcessEnv;
  /** Optional sink for tests — defaults to console.error(JSON). */
  emit?: (payload: GoogleRoutesFailedLog) => void;
};

/**
 * Emit a single structured `google_routes_failed` log line.
 * Payload is rebuilt from allowlisted, re-sanitized fields only.
 */
export function logGoogleRoutesFailure(input: LogGoogleRoutesFailureInput): GoogleRoutesFailedLog {
  const httpStatus =
    typeof input.httpStatus === "number" &&
    Number.isFinite(input.httpStatus) &&
    input.httpStatus >= 0 &&
    input.httpStatus <= 599
      ? Math.trunc(input.httpStatus)
      : null;

  const payload: GoogleRoutesFailedLog = {
    event: GOOGLE_ROUTES_FAILED_EVENT,
    httpStatus,
    googleErrorStatus: sanitizeGoogleErrorEnum(input.googleErrorStatus ?? null),
    googleErrorReason: sanitizeGoogleErrorEnum(input.googleErrorReason ?? null),
    googleErrorMessage: sanitizeGoogleErrorMessage(input.googleErrorMessage ?? null),
    failureStage: input.failureStage,
    vercelEnv: resolveVercelEnv(input.env),
    provider: GOOGLE_ROUTES_PROVIDER,
  };

  const emit =
    input.emit ??
    ((p: GoogleRoutesFailedLog) => {
      // Single JSON object — no extra context that could leak secrets.
      console.error(JSON.stringify(p));
    });
  emit(payload);
  return payload;
}
