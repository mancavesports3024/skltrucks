/**
 * Safe public HTTPS fetch for discovery-inspect validation.
 *
 * SSRF design (connection-pinned):
 * 1. Parse URL — HTTPS only; reject userinfo / credentials / fragments.
 * 2. Resolve hostname (injectable for tests).
 * 3. Reject if ANY address is private, loopback, link-local, CGNAT, multicast,
 *    unspecified, or IPv4-mapped equivalents (::ffff:127.0.0.1, etc.).
 * 4. Connect via node:https with a custom `lookup` that returns only the
 *    pre-validated public address (pinned). TLS SNI + Host stay the hostname.
 * 5. Every redirect re-runs steps 1–4. Cookies / Authorization are never sent.
 *
 * Response limits (streaming):
 * - Reject Content-Length above max before reading.
 * - Stream body; abort immediately once accumulated bytes exceed max.
 * - One overall deadline for the entire redirect chain (not renewed per hop).
 * - Errors/logs never include raw body text.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";

export const FETCH_TIMEOUT_MS = 15_000;
/** Overall deadline covering the full redirect chain for one start URL. */
export const FETCH_OVERALL_DEADLINE_MS = 20_000;
export const FETCH_MAX_BYTES = 1_500_000;
export const FETCH_MAX_REDIRECTS = 5;

export type ResolvedAddress = { address: string; family: 4 | 6 };

export type LookupImpl = (hostname: string) => Promise<ResolvedAddress[]>;

const defaultLookup: LookupImpl = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((r) => ({
    address: r.address,
    family: (r.family === 6 ? 6 : 4) as 4 | 6,
  }));
};

/** Expand IPv4-mapped IPv6 (::ffff:a.b.c.d) to the embedded IPv4 string. */
export function extractMappedIpv4(ip: string): string | null {
  const v = ip.trim().toLowerCase();
  const m = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (m) return m[1];
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  return null;
}

function ipv4Octets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

/** True when the address must never be connected to (SSRF). */
export function isBlockedIpAddress(ip: string): boolean {
  const raw = ip.trim().toLowerCase();
  if (!raw) return true;

  const mapped = extractMappedIpv4(raw);
  if (mapped) return isBlockedIpAddress(mapped);

  if (isIP(raw) === 4) {
    const o = ipv4Octets(raw);
    if (!o) return true;
    const [a, b] = o;
    if (a === 0) return true; // 0.0.0.0/8 unspecified / this-network
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 169 && b === 254) return true; // link-local
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a >= 224) return true; // multicast / reserved / broadcast
    return false;
  }

  if (isIP(raw) === 6) {
    // Unspecified
    if (raw === "::" || raw === "0:0:0:0:0:0:0:0") return true;
    // Loopback
    if (raw === "::1" || raw === "0:0:0:0:0:0:0:1") return true;
    // Expand compressed form roughly via leading hextets
    const normalized = raw.replace(/^\[|\]$/g, "");
    if (normalized.startsWith("fe80:") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
      return true; // link-local fe80::/10
    }
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return true; // unique local fc00::/7
    }
    if (normalized.startsWith("ff")) {
      return true; // multicast
    }
    return false;
  }

  return true;
}

/**
 * Resolve hostname and return public addresses only.
 * Rejects when DNS fails, yields no addresses, or ANY address is blocked
 * (mixed public+private → reject).
 */
export async function resolvePublicHostAddresses(
  hostname: string,
  lookupImpl: LookupImpl = defaultLookup
): Promise<{ ok: true; addresses: ResolvedAddress[] } | { ok: false; reason: string }> {
  const host = hostname.trim().toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false, reason: "localhost/private host blocked" };
  }

  if (isIP(host)) {
    if (isBlockedIpAddress(host)) {
      return { ok: false, reason: "private IP blocked" };
    }
    return {
      ok: true,
      addresses: [{ address: host, family: isIP(host) === 6 ? 6 : 4 }],
    };
  }

  let records: ResolvedAddress[];
  try {
    records = await lookupImpl(host);
  } catch {
    return { ok: false, reason: "DNS lookup failed" };
  }
  if (!records.length) {
    return { ok: false, reason: "DNS lookup returned no addresses" };
  }

  const blocked = records.filter((r) => isBlockedIpAddress(r.address));
  if (blocked.length > 0) {
    return {
      ok: false,
      reason:
        blocked.length === records.length
          ? "hostname resolves to private IP"
          : "hostname resolves to mixed public/private addresses",
    };
  }
  return { ok: true, addresses: records };
}

export async function assertPublicHttpUrl(
  rawUrl: string,
  options?: { lookupImpl?: LookupImpl }
): Promise<{ ok: true; url: URL; addresses: ResolvedAddress[] } | { ok: false; reason: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "unparseable URL" };
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
  const resolved = await resolvePublicHostAddresses(
    parsed.hostname,
    options?.lookupImpl ?? defaultLookup
  );
  if (!resolved.ok) return resolved;
  return { ok: true, url: parsed, addresses: resolved.addresses };
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

function remainingMs(deadlineAt: number): number {
  return Math.max(0, deadlineAt - Date.now());
}

function readBodyWithCap(
  stream: AsyncIterable<Buffer> | ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal: AbortSignal
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  return new Promise(async (resolve) => {
    if (!stream) {
      resolve({ ok: true, text: "" });
      return;
    }
    const chunks: Buffer[] = [];
    let total = 0;

    const onAbort = () => {
      resolve({ ok: false, reason: "timeout" });
    };
    if (signal.aborted) {
      resolve({ ok: false, reason: "timeout" });
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      // Web ReadableStream (fetch Response.body)
      if (typeof (stream as ReadableStream<Uint8Array>).getReader === "function") {
        const reader = (stream as ReadableStream<Uint8Array>).getReader();
        for (;;) {
          if (signal.aborted) {
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            resolve({ ok: false, reason: "timeout" });
            return;
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            total += value.byteLength;
            if (total > maxBytes) {
              try {
                await reader.cancel();
              } catch {
                /* ignore */
              }
              resolve({ ok: false, reason: "response too large" });
              return;
            }
            chunks.push(Buffer.from(value));
          }
        }
      } else {
        // Node IncomingMessage / async iterable
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          if (signal.aborted) {
            resolve({ ok: false, reason: "timeout" });
            return;
          }
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += buf.byteLength;
          if (total > maxBytes) {
            resolve({ ok: false, reason: "response too large" });
            return;
          }
          chunks.push(buf);
        }
      }
      signal.removeEventListener("abort", onAbort);
      resolve({
        ok: true,
        text: Buffer.concat(chunks).toString("utf8"),
      });
    } catch (e) {
      signal.removeEventListener("abort", onAbort);
      const aborted =
        signal.aborted ||
        (e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message)));
      resolve({
        ok: false,
        reason: aborted ? "timeout" : e instanceof Error ? e.message : "read failed",
      });
    }
  });
}

function pinnedHttpsRequest(args: {
  url: URL;
  pinned: ResolvedAddress;
  signal: AbortSignal;
  headers: Record<string, string>;
}): Promise<{ status: number; headers: IncomingMessage["headers"]; body: IncomingMessage }> {
  return new Promise((resolve, reject) => {
    if (args.signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const req = https.request(
      {
        protocol: "https:",
        hostname: args.url.hostname,
        port: args.url.port || 443,
        path: `${args.url.pathname}${args.url.search}`,
        method: "GET",
        servername: args.url.hostname,
        headers: {
          ...args.headers,
          Host: args.url.hostname,
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, args.pinned.address, args.pinned.family);
        },
      },
      (res) => {
        resolve({ status: res.statusCode || 0, headers: res.headers, body: res });
      }
    );
    const onAbort = () => {
      req.destroy(new Error("aborted"));
    };
    args.signal.addEventListener("abort", onAbort, { once: true });
    req.on("error", (err) => {
      args.signal.removeEventListener("abort", onAbort);
      reject(err);
    });
    req.setTimeout(remainingMs(Date.now() + 60_000), () => {
      req.destroy(new Error("aborted"));
    });
    // Clear default cookie jars — never set Cookie/Authorization.
    req.end();
  });
}

/**
 * Fetch HTML with bounded redirects; validate + pin every hop for SSRF.
 * Prefer connection-pinned https.request; `fetchImpl` is test-only and still
 * applies Content-Length / streaming caps + public-URL gates (not production pinning).
 */
export async function safeFetchPublicHtml(
  startUrl: string,
  options?: {
    timeoutMs?: number;
    overallDeadlineMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    /** Injected fetch for unit tests (not connection-pinned). */
    fetchImpl?: typeof fetch;
    lookupImpl?: LookupImpl;
    deadlineAt?: number;
  }
): Promise<SafeFetchResult> {
  const maxBytes = options?.maxBytes ?? FETCH_MAX_BYTES;
  const maxRedirects = options?.maxRedirects ?? FETCH_MAX_REDIRECTS;
  const overallDeadlineMs = options?.overallDeadlineMs ?? FETCH_OVERALL_DEADLINE_MS;
  const deadlineAt = options?.deadlineAt ?? Date.now() + overallDeadlineMs;
  const lookupImpl = options?.lookupImpl ?? defaultLookup;
  const fetchImpl = options?.fetchImpl;

  let current = startUrl;
  let redirectCount = 0;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remainingMs(deadlineAt));

  try {
    for (;;) {
      if (controller.signal.aborted || Date.now() >= deadlineAt) {
        return { ok: false, reason: "timeout", finalUrl: current };
      }

      const gate = await assertPublicHttpUrl(current, { lookupImpl });
      if (!gate.ok) return { ok: false, reason: gate.reason, finalUrl: current };

      const headers = {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": "SKL-sourcing-discovery-inspect/1.0",
        // Explicitly no Cookie / Authorization / credential headers.
      };

      let status: number;
      let contentType: string;
      let location: string | null = null;
      let contentLength: number | null = null;
      let bodySource: AsyncIterable<Buffer> | ReadableStream<Uint8Array> | null = null;

      if (fetchImpl) {
        const res = await fetchImpl(gate.url.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers,
          cache: "no-store",
        });
        status = res.status;
        contentType = (res.headers.get("content-type") || "").toLowerCase();
        location = res.headers.get("location");
        const cl = res.headers.get("content-length");
        contentLength = cl && /^\d+$/.test(cl) ? Number(cl) : null;
        bodySource = res.body;
      } else {
        const pinned = gate.addresses[0];
        const res = await pinnedHttpsRequest({
          url: gate.url,
          pinned,
          signal: controller.signal,
          headers,
        });
        status = res.status;
        const rawCt = res.headers["content-type"];
        contentType = (Array.isArray(rawCt) ? rawCt[0] : rawCt || "").toLowerCase();
        const rawLoc = res.headers.location;
        location = Array.isArray(rawLoc) ? rawLoc[0] : rawLoc || null;
        const rawCl = res.headers["content-length"];
        const clStr = Array.isArray(rawCl) ? rawCl[0] : rawCl;
        contentLength = clStr && /^\d+$/.test(clStr) ? Number(clStr) : null;
        bodySource = res.body;
      }

      if ([301, 302, 303, 307, 308].includes(status)) {
        if (!location) {
          return {
            ok: false,
            reason: "redirect without Location",
            status,
            finalUrl: current,
          };
        }
        redirectCount += 1;
        if (redirectCount > maxRedirects) {
          return {
            ok: false,
            reason: "too many redirects",
            status,
            finalUrl: current,
          };
        }
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return { ok: false, reason: "invalid redirect Location", status, finalUrl: current };
        }
        if (next.username || next.password) {
          return {
            ok: false,
            reason: "URL userinfo not allowed",
            status,
            finalUrl: next.toString(),
          };
        }
        current = next.toString();
        continue;
      }

      if (status < 200 || status >= 300) {
        return {
          ok: false,
          reason: `HTTP ${status}`,
          status,
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
          status,
          finalUrl: current,
          contentType,
        };
      }

      if (contentLength != null && contentLength > maxBytes) {
        return {
          ok: false,
          reason: "response too large",
          status,
          finalUrl: current,
          contentType,
        };
      }

      const body = await readBodyWithCap(bodySource, maxBytes, controller.signal);
      if (!body.ok) {
        return {
          ok: false,
          reason: body.reason,
          status,
          finalUrl: current,
          contentType,
        };
      }

      return {
        ok: true,
        finalUrl: current,
        status,
        contentType,
        bodyText: body.text,
        redirectCount,
      };
    }
  } catch (e) {
    const aborted =
      controller.signal.aborted ||
      (e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message)));
    return {
      ok: false,
      // Never include response bodies in error strings.
      reason: aborted ? "timeout" : e instanceof Error ? e.message.slice(0, 200) : "fetch failed",
      finalUrl: current,
    };
  } finally {
    clearTimeout(timer);
  }
}
