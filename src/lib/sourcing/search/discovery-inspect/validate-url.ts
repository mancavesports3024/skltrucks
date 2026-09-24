/**
 * Live URL validation before inspection spend.
 * Rejects hubs, PDFs, bot challenges, redirect-to-category, SSRF targets.
 */
import { canonicalizeListingUrl } from "@/lib/sourcing/duplicates";
import {
  classifyDiscoveryUrl,
  detectDiscoveryHub,
} from "@/lib/sourcing/search/discovery/url-classify";
import {
  assertPublicHttpUrl,
  safeFetchPublicHtml,
  type SafeFetchResult,
} from "@/lib/sourcing/search/discovery-inspect/fetch-page";

export type ValidationOutcome =
  | "validated"
  | "rejected"
  | "unverified";

export type ValidatedListingCandidate = {
  discoveryUrl: string;
  finalUrl: string;
  canonicalUrl: string;
  hostname: string;
  title: string;
  outcome: ValidationOutcome;
  reason: string;
  httpStatus?: number;
  /** HTML body when validated (for deterministic extract). */
  html?: string;
};

const BOT_CHALLENGE_RE =
  /captcha|cloudflare|browser-gate|checking your browser|security check|access denied|bot detection|cf-challenge/i;

function pathLooksLikeCategory(path: string): boolean {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/" || /\/(search|search-inventory|results|category|categories|inventory)\/?$/i.test(p)) {
    return true;
  }
  if (/\/(box-trucks?-for-sale|trucks-for-sale|all-for-sale|medium-duty-box-trucks)\/?$/i.test(p)) {
    return true;
  }
  return false;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function titleFromHtml(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim().slice(0, 200) : "";
}

/**
 * Validate one retained discovery candidate. Never treats 403/bot as verified.
 */
export async function validateDiscoveryCandidate(
  discoveryUrl: string,
  options?: {
    fetchImpl?: typeof fetch;
    /** When provided, skip network (tests). */
    fetchResult?: SafeFetchResult;
  }
): Promise<ValidatedListingCandidate> {
  const classified = classifyDiscoveryUrl(discoveryUrl);
  if (classified.bucket === "unsupported_or_unsafe") {
    return {
      discoveryUrl,
      finalUrl: discoveryUrl,
      canonicalUrl: classified.canonicalUrl,
      hostname: classified.hostname,
      title: "",
      outcome: "rejected",
      reason: classified.reason,
    };
  }
  if (classified.bucket === "hub_or_category") {
    return {
      discoveryUrl,
      finalUrl: discoveryUrl,
      canonicalUrl: classified.canonicalUrl,
      hostname: classified.hostname,
      title: "",
      outcome: "rejected",
      reason: classified.reason,
    };
  }

  const gate = await assertPublicHttpUrl(discoveryUrl);
  if (!gate.ok) {
    return {
      discoveryUrl,
      finalUrl: discoveryUrl,
      canonicalUrl: classified.canonicalUrl,
      hostname: classified.hostname,
      title: "",
      outcome: "rejected",
      reason: gate.reason,
    };
  }

  const fetched =
    options?.fetchResult ??
    (await safeFetchPublicHtml(discoveryUrl, { fetchImpl: options?.fetchImpl }));

  if (!fetched.ok) {
    const status = fetched.status;
    if (status === 403 || status === 401 || status === 429) {
      return {
        discoveryUrl,
        finalUrl: fetched.finalUrl || discoveryUrl,
        canonicalUrl: canonicalizeListingUrl(fetched.finalUrl || discoveryUrl),
        hostname: hostOf(fetched.finalUrl || discoveryUrl),
        title: "",
        outcome: "unverified",
        reason: `HTTP ${status} — cannot confirm as a unit`,
        httpStatus: status,
      };
    }
    if (/non-HTML|pdf/i.test(fetched.reason)) {
      return {
        discoveryUrl,
        finalUrl: fetched.finalUrl || discoveryUrl,
        canonicalUrl: canonicalizeListingUrl(fetched.finalUrl || discoveryUrl),
        hostname: hostOf(fetched.finalUrl || discoveryUrl),
        title: "",
        outcome: "rejected",
        reason: fetched.reason,
        httpStatus: status,
      };
    }
    return {
      discoveryUrl,
      finalUrl: fetched.finalUrl || discoveryUrl,
      canonicalUrl: canonicalizeListingUrl(fetched.finalUrl || discoveryUrl),
      hostname: hostOf(fetched.finalUrl || discoveryUrl),
      title: "",
      outcome: "unverified",
      reason: fetched.reason,
      httpStatus: status,
    };
  }

  const finalUrl = fetched.finalUrl;
  const finalClass = classifyDiscoveryUrl(finalUrl);
  let finalPath = "/";
  try {
    finalPath = new URL(finalUrl).pathname;
  } catch {
    /* ignore */
  }

  if (finalClass.bucket === "hub_or_category" || pathLooksLikeCategory(finalPath)) {
    return {
      discoveryUrl,
      finalUrl,
      canonicalUrl: canonicalizeListingUrl(finalUrl),
      hostname: hostOf(finalUrl),
      title: titleFromHtml(fetched.bodyText),
      outcome: "rejected",
      reason: "redirected or resolved to category/search/hub page",
      httpStatus: fetched.status,
    };
  }

  const hub = detectDiscoveryHub(
    hostOf(finalUrl),
    finalPath.replace(/\/+$/, "") || "/",
    ""
  );
  if (hub) {
    return {
      discoveryUrl,
      finalUrl,
      canonicalUrl: canonicalizeListingUrl(finalUrl),
      hostname: hostOf(finalUrl),
      title: titleFromHtml(fetched.bodyText),
      outcome: "rejected",
      reason: hub,
      httpStatus: fetched.status,
    };
  }

  if (BOT_CHALLENGE_RE.test(fetched.bodyText) || BOT_CHALLENGE_RE.test(titleFromHtml(fetched.bodyText))) {
    return {
      discoveryUrl,
      finalUrl,
      canonicalUrl: canonicalizeListingUrl(finalUrl),
      hostname: hostOf(finalUrl),
      title: titleFromHtml(fetched.bodyText),
      outcome: "unverified",
      reason: "bot/challenge page — cannot confirm as a unit",
      httpStatus: fetched.status,
    };
  }

  // Final URL must still look unit-shaped or individual
  if (
    finalClass.bucket !== "individual_listing" &&
    finalClass.bucket !== "likely_listing_needs_inspection"
  ) {
    return {
      discoveryUrl,
      finalUrl,
      canonicalUrl: canonicalizeListingUrl(finalUrl),
      hostname: hostOf(finalUrl),
      title: titleFromHtml(fetched.bodyText),
      outcome: "rejected",
      reason: finalClass.reason,
      httpStatus: fetched.status,
    };
  }

  return {
    discoveryUrl,
    finalUrl,
    canonicalUrl: canonicalizeListingUrl(finalUrl),
    hostname: hostOf(finalUrl),
    title: titleFromHtml(fetched.bodyText),
    outcome: "validated",
    reason: "public HTML unit candidate",
    httpStatus: fetched.status,
    html: fetched.bodyText,
  };
}
