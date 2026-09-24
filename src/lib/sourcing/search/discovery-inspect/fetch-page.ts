/**
 * Safe public HTML fetch for discovery-inspect validation.
 * Manual redirect following with SSRF checks on every hop.
 * No cookies, credentials, or private APIs.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const FETCH_TIMEOUT_MS = 15_000;
export const FETCH_MAX_BYTES = 1_500_000;
export const FETCH_MAX_REDIRECTS = 5;

const PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d)\./,
];

function isPrivateIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v === "::1" || v === "0:0:0:0:0:0:0:1") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:")) return true;
  if (v.includes(".")) {
    return PRIVATE_V4.some((re) => re.test(v));
  }
  return false;
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<{
  ok: true;
  url: URL;
} | { ok: false; reason: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "unparseable URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "only http(s) allowed" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "HTTPS required" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URL userinfo not allowed" };
  }
  if (parsed.hash && parsed.hash.length > 1) {
    return { ok: false, reason: "URL fragment not allowed" };
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false, reason: "localhost/private host blocked" };
  }
  if (isIP(host) && isPrivateIp(host)) {
    return { ok: false, reason: "private IP blocked" };
  }
  if (!isIP(host)) {
    try {
      const records = await lookup(host, { all: true, verbatim: true });
      for (const r of records) {
        if (isPrivateIp(r.address)) {
          return { ok: false, reason: "hostname resolves to private IP" };
        }
      }
    } catch {
      return { ok: false, reason: "DNS lookup failed" };
    }
  }
  return { ok: true, url: parsed };
}

export type SafeFetchResult =
  | {
      ok: true;
      finalUrl: string;
      status: number;
      contentType: string;
      bodyText: string;
      redirectCount: number;
    }
  | {
      ok: false;
      reason: string;
      status?: number;
      finalUrl?: string;
      contentType?: string;
    };

/**
 * Fetch HTML with bounded redirects; validate every hop for SSRF.
 */
export async function safeFetchPublicHtml(
  startUrl: string,
  options?: {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    /** Injected fetch for tests. */
    fetchImpl?: typeof fetch;
  }
): Promise<SafeFetchResult> {
  const timeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? FETCH_MAX_BYTES;
  const maxRedirects = options?.maxRedirects ?? FETCH_MAX_REDIRECTS;
  const fetchImpl = options?.fetchImpl ?? fetch;

  let current = startUrl;
  let redirectCount = 0;

  for (;;) {
    const gate = await assertPublicHttpUrl(current);
    if (!gate.ok) return { ok: false, reason: gate.reason, finalUrl: current };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(gate.url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "User-Agent": "SKL-sourcing-discovery-inspect/1.0",
        },
        cache: "no-store",
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) {
          return {
            ok: false,
            reason: "redirect without Location",
            status: res.status,
            finalUrl: current,
          };
        }
        redirectCount += 1;
        if (redirectCount > maxRedirects) {
          return {
            ok: false,
            reason: "too many redirects",
            status: res.status,
            finalUrl: current,
          };
        }
        current = new URL(loc, current).toString();
        continue;
      }

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (!res.ok) {
        return {
          ok: false,
          reason: `HTTP ${res.status}`,
          status: res.status,
          finalUrl: current,
          contentType,
        };
      }

      if (
        contentType &&
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml")
      ) {
        return {
          ok: false,
          reason: `non-HTML content-type: ${contentType.split(";")[0]}`,
          status: res.status,
          finalUrl: current,
          contentType,
        };
      }

      const buf = await res.arrayBuffer();
      if (buf.byteLength > maxBytes) {
        return {
          ok: false,
          reason: "response too large",
          status: res.status,
          finalUrl: current,
          contentType,
        };
      }
      const bodyText = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      return {
        ok: true,
        finalUrl: current,
        status: res.status,
        contentType,
        bodyText,
        redirectCount,
      };
    } catch (e) {
      const aborted =
        e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message));
      return {
        ok: false,
        reason: aborted ? "timeout" : e instanceof Error ? e.message : "fetch failed",
        finalUrl: current,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
