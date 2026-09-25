/**
 * Listing identity continuity + importable unit-evidence gates.
 * Shared by Preview validation and Import server-side revalidation.
 */
import { canonicalizeListingUrl } from "@/lib/sourcing/duplicates";
import type { ExtractedTruckCandidate } from "@/lib/sourcing/search/types";

export const REDIRECT_LOST_LISTING_IDENTITY = "Redirect lost individual listing identity.";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;
const PLACEHOLDER_RE = /^(n\/?a|none|unknown|null|undefined|-|—|–)$/i;

/** Normalize a candidate identity token for comparison. */
function normToken(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, "");
}

/**
 * Extract listing-identity keys from a URL (lot/lid/unit/stock/VIN/numeric ids).
 * Used to prove a redirect still refers to the same unit.
 */
export function extractListingIdentityKeys(url: string): string[] {
  const keys = new Set<string>();
  try {
    const u = new URL(url);
    for (const [k, v] of u.searchParams.entries()) {
      if (!v.trim()) continue;
      if (/^(lid|lot|lot[_-]?id|listing|listing[_-]?id|stock|stock[_-]?no|unit|unit[_-]?id|id)$/i.test(k)) {
        keys.add(normToken(v));
      }
    }
    const path = u.pathname;
    const vinMatch = path.match(/[A-HJ-NPR-Z0-9]{17}/i);
    if (vinMatch) keys.add(vinMatch[0].toUpperCase());

    const unitMatch = path.match(/\/unit-(\d{4,})\b/i);
    if (unitMatch) keys.add(unitMatch[1]);

    const stockMatch = path.match(/(?:^|\/|-)stock-([a-z0-9-]{2,})\b/i);
    if (stockMatch) keys.add(normToken(stockMatch[1]));

    const segments = path.split("/").filter(Boolean);
    for (const seg of segments) {
      const s = decodeURIComponent(seg);
      if (/^\d{6,}$/.test(s)) keys.add(s);
      if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s)) {
        keys.add(s.toLowerCase());
      }
      // lotdetail.asp leaf is not an id; numeric siblings already captured
      if (/^(unit|stock|listing|lot)[-_]?(\d{4,})$/i.test(s)) {
        const m = s.match(/(\d{4,})$/);
        if (m) keys.add(m[1]);
      }
      // Dealer VDP slugs: /for-sale/2027-freightliner-m2-box-truck-14437263
      const trailingListingId = s.match(/(?:^|-)(\d{5,})$/);
      if (trailingListingId) keys.add(trailingListingId[1]);
    }
  } catch {
    /* ignore */
  }
  return [...keys].filter(Boolean);
}

function softEqualCanonical(a: string, b: string): boolean {
  const na = a.replace(/\/+$/, "").toLowerCase();
  const nb = b.replace(/\/+$/, "").toLowerCase();
  return Boolean(na && nb && na === nb);
}

/**
 * When the final canonical URL differs materially from discovery, require a shared
 * VIN / stock / unit / lot / listing id in the final URL or fetched page HTML.
 */
export function assertRedirectPreservesListingIdentity(
  discoveryUrl: string,
  finalUrl: string,
  finalHtml = ""
): { ok: true } | { ok: false; reason: string } {
  const discCanon = canonicalizeListingUrl(discoveryUrl);
  const finalCanon = canonicalizeListingUrl(finalUrl);
  if (discCanon && finalCanon && softEqualCanonical(discCanon, finalCanon)) {
    return { ok: true };
  }

  // Same path ignoring query soft-equal already handled by canonicalize in most cases.
  try {
    const d = new URL(discoveryUrl);
    const f = new URL(finalUrl);
    if (
      d.hostname.replace(/^www\./i, "").toLowerCase() ===
        f.hostname.replace(/^www\./i, "").toLowerCase() &&
      softEqualCanonical(d.pathname, f.pathname)
    ) {
      return { ok: true };
    }
  } catch {
    /* fall through */
  }

  const discKeys = extractListingIdentityKeys(discoveryUrl);
  if (discKeys.length === 0) {
    // No extractable identity on discovery — treat material path change as lost identity
    // when the final path no longer looks like the same leaf resource.
    try {
      const dLeaf = new URL(discoveryUrl).pathname.split("/").filter(Boolean).pop() || "";
      const fLeaf = new URL(finalUrl).pathname.split("/").filter(Boolean).pop() || "";
      if (dLeaf && fLeaf && normToken(dLeaf) === normToken(fLeaf)) {
        return { ok: true };
      }
    } catch {
      /* ignore */
    }
    return { ok: false, reason: REDIRECT_LOST_LISTING_IDENTITY };
  }

  const haystack = `${finalUrl}\n${finalHtml}`;
  const preserved = discKeys.some((k) => {
    if (!k) return false;
    if (VIN_RE.test(k)) {
      return new RegExp(k, "i").test(haystack);
    }
    return haystack.toLowerCase().includes(k.toLowerCase());
  });

  if (!preserved) {
    return { ok: false, reason: REDIRECT_LOST_LISTING_IDENTITY };
  }
  return { ok: true };
}

function isPlaceholder(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  return !v || PLACEHOLDER_RE.test(v);
}

/**
 * Keep VIN / stock only when the token is present on the validated final page
 * (URL or HTML). Model-only identifiers never win over page-backed ones and
 * never survive alone.
 */
export function pickPageBackedIdentityFields(args: {
  deterministic: Pick<ExtractedTruckCandidate, "vin" | "stockNumber">;
  model?: Pick<ExtractedTruckCandidate, "vin" | "stockNumber"> | null;
  finalUrl: string;
  html?: string;
}): { vin: string; stockNumber: string } {
  const haystack = `${args.finalUrl}\n${args.html || ""}`;
  const hayUpper = haystack.toUpperCase();
  const hayLower = haystack.toLowerCase();

  const detVin = String(args.deterministic.vin || "").trim().toUpperCase();
  const modelVin = String(args.model?.vin || "").trim().toUpperCase();
  const detVinOk = VIN_RE.test(detVin) && hayUpper.includes(detVin);
  const modelVinOk = VIN_RE.test(modelVin) && hayUpper.includes(modelVin);
  // Prefer page-backed model VIN only when it truly appears; else keep page det.
  const vin = modelVinOk ? modelVin : detVinOk ? detVin : "";

  const detStock = String(args.deterministic.stockNumber || "").trim();
  const modelStock = String(args.model?.stockNumber || "").trim();
  const detStockOk =
    !isPlaceholder(detStock) &&
    detStock.length >= 2 &&
    hayLower.includes(detStock.toLowerCase());
  const modelStockOk =
    !isPlaceholder(modelStock) &&
    modelStock.length >= 2 &&
    hayLower.includes(modelStock.toLowerCase());
  const stockNumber = modelStockOk ? modelStock : detStockOk ? detStock : "";

  return { vin, stockNumber };
}

/**
 * Positive individual-unit evidence required before import eligibility.
 * VIN (17) OR stock/unit/lot/listing ID supported by the final page,
 * plus recognizable year/make/model.
 */
export function hasImportableUnitEvidence(args: {
  truck: ExtractedTruckCandidate;
  finalUrl: string;
  html?: string;
}): { ok: true } | { ok: false; reason: string } {
  const truck = args.truck;
  const haystack = `${args.finalUrl}\n${args.html || ""}`;
  const haystackLower = haystack.toLowerCase();

  const vin = String(truck.vin || "").trim().toUpperCase();
  const validVin = VIN_RE.test(vin) && haystack.toUpperCase().includes(vin);

  const stock = String(truck.stockNumber || "").trim();
  const stockOk =
    !isPlaceholder(stock) &&
    stock.length >= 2 &&
    haystackLower.includes(stock.toLowerCase());

  const urlIds = extractListingIdentityKeys(args.finalUrl);
  const urlIdSupported = urlIds.some((id) => {
    if (VIN_RE.test(id)) return haystack.toUpperCase().includes(id.toUpperCase());
    // Numeric / UUID lot or listing id must appear in page body (not only URL)
    // OR match truck stock when present.
    if (stockOk && id === normToken(stock)) return true;
    if (/^\d{5,}$/.test(id) || /^[a-f0-9-]{36}$/i.test(id)) {
      return (
        new RegExp(`(?:lot|listing|lid|stock|unit)[^a-z0-9]{0,6}${id}\\b`, "i").test(haystack) ||
        (args.html || "").toLowerCase().includes(id.toLowerCase())
      );
    }
    return false;
  });

  if (!validVin && !stockOk && !urlIdSupported) {
    return {
      ok: false,
      reason:
        "missing VIN or stock/unit/lot/listing ID supported by the final page",
    };
  }

  const year = truck.year;
  const makeModel = String(truck.makeModel || "").trim();
  const yearOk = typeof year === "number" && year >= 1980 && year <= 2100;
  const makeModelOk =
    makeModel.length >= 3 &&
    !isPlaceholder(makeModel) &&
    /[a-z]/i.test(makeModel) &&
    !/^(heavy construction|for sale|equipment|auctions?)$/i.test(makeModel);

  if (!yearOk || !makeModelOk) {
    return {
      ok: false,
      reason: "missing recognizable year/make/model on final page",
    };
  }

  return { ok: true };
}

/**
 * Marketplace / category landing shapes that are not individual units.
 * Complements detectDiscoveryHub for post-redirect finals like
 * /for-sale/heavy-construction-equipment.
 */
export function pathLooksLikeCategoryOrMarketplaceHub(path: string): boolean {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/" || /\/(search|search-inventory|results|category|categories|inventory)\/?$/i.test(p)) {
    return true;
  }
  if (/\/(box-trucks?-for-sale|trucks-for-sale|all-for-sale|medium-duty-box-trucks)\/?$/i.test(p)) {
    return true;
  }
  // /for-sale or /for-sale/{generic-slug} without year-make-id unit pattern
  if (/\/for-sale\/?$/i.test(p)) return true;
  if (
    /\/for-sale\/[a-z][a-z0-9-]+\/?$/i.test(p) &&
    !/\/for-sale\/\d{4}-[a-z0-9-]+-\d{5,}\/?$/i.test(p)
  ) {
    return true;
  }
  // Generic marketplace browse roots
  if (/\/(auctions|browse|catalog|shop|marketplace)\/?$/i.test(p)) return true;
  if (
    /\/(auctions|browse|catalog)\/[a-z][a-z0-9-]+\/?$/i.test(p) &&
    !/\d{5,}/.test(p)
  ) {
    return true;
  }
  return false;
}
