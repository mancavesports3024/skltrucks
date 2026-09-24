import "server-only";

/**
 * Per-instance best-effort guard for Google Routes calls.
 *
 * IMPORTANT (Vercel / serverless truth):
 * This counter lives in process memory. Each serverless isolate has its own counter,
 * which resets on cold start / redeploy. It is NOT a reliable application-wide daily
 * hard cap across the fleet.
 *
 * Authoritative hard limits must be configured in Google Cloud (Routes API quotas +
 * budget alerts). Configure `GOOGLE_ROUTES_DAILY_LIMIT` only as an optional soft guard
 * inside one instance.
 */
export const GOOGLE_ROUTES_DAILY_LIMIT_ENV = "GOOGLE_ROUTES_DAILY_LIMIT";
export const DEFAULT_GOOGLE_ROUTES_DAILY_LIMIT = 100;

export function getGoogleRoutesDailyLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = String(env[GOOGLE_ROUTES_DAILY_LIMIT_ENV] ?? "").trim();
  if (!raw) return DEFAULT_GOOGLE_ROUTES_DAILY_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_GOOGLE_ROUTES_DAILY_LIMIT;
  return Math.floor(n);
}

type DayCounter = { day: string; count: number };

let counter: DayCounter = { day: "", count: 0 };

function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Test helper — reset in-memory daily counter. */
export function resetGoogleRoutesDailyCounterForTests(): void {
  counter = { day: "", count: 0 };
}

export function getGoogleRoutesDailyCountForTests(): number {
  return counter.day === utcDay() ? counter.count : 0;
}

export type DailyLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; message: string };

/**
 * Reserve one provider call against the in-process soft ceiling.
 * Not a substitute for Google Cloud quotas/budgets.
 */
export function tryConsumeGoogleRoutesDailyQuota(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date()
): DailyLimitResult {
  const limit = getGoogleRoutesDailyLimit(env);
  const day = utcDay(now);
  if (counter.day !== day) {
    counter = { day, count: 0 };
  }
  if (counter.count >= limit) {
    return {
      ok: false,
      message:
        "Driving-distance per-instance soft limit reached on this server. Enter Transportation manually, or raise Google Cloud Routes API quotas / try again later.",
    };
  }
  counter.count += 1;
  return { ok: true, remaining: Math.max(0, limit - counter.count) };
}
