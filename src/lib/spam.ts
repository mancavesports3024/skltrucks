/**
 * Shared spam checks for public form API routes.
 * Silent rejects return ok:false with silent:true — respond 200 so bots don't retry.
 */

const SEO_SPAM_PATTERNS = [
  /rank higher on google/i,
  /seo\b/i,
  /free\s*(website\s*)?audit/i,
  /quick wins/i,
  /increase (your )?traffic/i,
  /backlinks?/i,
  /link building/i,
  /guest post/i,
  /crypto/i,
  /bitcoin/i,
  /viagra/i,
  /casino/i,
  /forex/i,
];

const MIN_FORM_MS = 2500;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;

const recentByIp = new Map<string, number[]>();

export type SpamCheckResult =
  | { ok: true; clean: Record<string, unknown> }
  | { ok: false; silent: boolean; reason: string };

function stripInternalFields(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "website" || key === "company_url" || key === "formStartedAt" || key === "_gotcha") {
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

/** Random keyboard-smash: long string, few vowels, mixed case, no spaces. */
export function looksLikeGibberish(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (s.length < 10) return false;
  if (/\s/.test(s)) return false;
  if (!/^[A-Za-z0-9]+$/.test(s)) return false;

  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 8) return false;

  const vowels = (letters.match(/[aeiouAEIOU]/g) || []).length;
  const vowelRatio = vowels / letters.length;
  const hasMixedCase = /[a-z]/.test(letters) && /[A-Z]/.test(letters);

  // e.g. SpPjnXYkRENpiYWJrkLA
  if (hasMixedCase && vowelRatio < 0.28 && letters.length >= 12) return true;
  if (vowelRatio < 0.18 && letters.length >= 14) return true;

  return false;
}

function looksLikeSpamEmail(email: unknown): boolean {
  if (typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  // Many single-letter segments: i.w.ap.od.o.f.u.po.f.84@gmail.com
  const local = e.split("@")[0] || "";
  const dots = (local.match(/\./g) || []).length;
  if (dots >= 4) return true;
  if (/^[a-z](\.[a-z0-9]+){4,}@/.test(e)) return true;
  return false;
}

function looksLikePhone(phone: unknown): boolean {
  if (typeof phone !== "string" || !phone.trim()) return true; // optional ok
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function textHasSeoSpam(...parts: unknown[]): boolean {
  const text = parts.filter((p) => typeof p === "string").join("\n");
  return SEO_SPAM_PATTERNS.some((re) => re.test(text));
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const prev = (recentByIp.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (prev.length >= RATE_MAX) {
    recentByIp.set(ip, prev);
    return false;
  }
  prev.push(now);
  recentByIp.set(ip, prev);
  return true;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Run spam checks. Always strip honeypot/timing fields from returned clean data.
 */
export function checkFormSpam(
  data: Record<string, unknown>,
  request: Request,
  options: { kind: "contact" | "financing" | "sell-truck" }
): SpamCheckResult {
  const ip = getClientIp(request);

  // Honeypot — real users never fill these
  const honeypot = String(data.website || data.company_url || data._gotcha || "").trim();
  if (honeypot) {
    return { ok: false, silent: true, reason: "honeypot" };
  }

  // Too-fast submit (bots)
  const started = Number(data.formStartedAt);
  if (Number.isFinite(started) && started > 0) {
    const elapsed = Date.now() - started;
    if (elapsed < MIN_FORM_MS) {
      return { ok: false, silent: true, reason: "too_fast" };
    }
  }

  if (!checkRateLimit(ip)) {
    return { ok: false, silent: true, reason: "rate_limit" };
  }

  if (looksLikeSpamEmail(data.email)) {
    return { ok: false, silent: true, reason: "spam_email" };
  }

  const phoneFields = [data.phone, data.dealerPhone];
  for (const p of phoneFields) {
    if (p !== undefined && p !== "" && !looksLikePhone(p)) {
      return { ok: false, silent: false, reason: "invalid_phone" };
    }
  }

  if (options.kind === "contact") {
    if (textHasSeoSpam(data.message, data.name)) {
      return { ok: false, silent: true, reason: "seo_spam" };
    }
  }

  if (options.kind === "sell-truck") {
    if (textHasSeoSpam(data.comments, data.accessories, data.firstName, data.lastName)) {
      return { ok: false, silent: true, reason: "seo_spam" };
    }
  }

  if (options.kind === "financing") {
    const critical = [
      data.companyName,
      data.contactName,
      data.street,
      data.city,
      data.federalTaxId,
      data.bankName,
      data.guarantor1Name,
      data.guarantor1SSN,
      data.signature1,
    ];
    const gibberishCount = critical.filter(looksLikeGibberish).length;
    if (gibberishCount >= 2) {
      return { ok: false, silent: true, reason: "gibberish" };
    }
    // EIN / tax id and SSN should look numeric-ish if provided
    const taxId = String(data.federalTaxId || "").replace(/\D/g, "");
    if (String(data.federalTaxId || "").trim() && taxId.length < 8) {
      // filled but not numeric — often spam
      if (looksLikeGibberish(data.federalTaxId)) {
        return { ok: false, silent: true, reason: "bad_tax_id" };
      }
    }
  }

  return { ok: true, clean: stripInternalFields(data) };
}
