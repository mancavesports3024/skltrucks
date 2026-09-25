/**
 * SSRF / streaming / IP-block regression tests for discovery-inspect fetch.
 */
import { describe, expect, it, vi } from "vitest";
import {
  assertPublicHttpUrl,
  extractMappedIpv4,
  isBlockedIpAddress,
  resolvePublicHostAddresses,
  safeFetchPublicHtml,
  FETCH_MAX_BYTES,
} from "@/lib/sourcing/search/discovery-inspect/fetch-page";

describe("isBlockedIpAddress", () => {
  it("blocks IPv4 loopback / private / link-local / CGNAT / multicast", () => {
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("10.0.0.5")).toBe(true);
    expect(isBlockedIpAddress("192.168.1.1")).toBe(true);
    expect(isBlockedIpAddress("172.16.0.1")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("100.64.0.1")).toBe(true);
    expect(isBlockedIpAddress("100.127.255.255")).toBe(true);
    expect(isBlockedIpAddress("0.0.0.0")).toBe(true);
    expect(isBlockedIpAddress("224.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("1.1.1.1")).toBe(false);
  });

  it("blocks IPv6 loopback / link-local / unique-local / unspecified / multicast", () => {
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("::")).toBe(true);
    expect(isBlockedIpAddress("fe80::1")).toBe(true);
    expect(isBlockedIpAddress("fc00::1")).toBe(true);
    expect(isBlockedIpAddress("fd12:3456::1")).toBe(true);
    expect(isBlockedIpAddress("ff02::1")).toBe(true);
    expect(isBlockedIpAddress("2001:4860:4860::8888")).toBe(false);
  });

  it("blocks IPv4-mapped IPv6 equivalents", () => {
    expect(extractMappedIpv4("::ffff:127.0.0.1")).toBe("127.0.0.1");
    expect(isBlockedIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("resolvePublicHostAddresses", () => {
  it("rejects when DNS contains any private address (mixed public+private)", async () => {
    const result = await resolvePublicHostAddresses("evil.example", async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/mixed|private/i);
  });

  it("rejects DNS rebinding-style private-only resolution at connect time", async () => {
    const result = await resolvePublicHostAddresses("rebind.example", async () => [
      { address: "127.0.0.1", family: 4 },
    ]);
    expect(result.ok).toBe(false);
  });

  it("accepts all-public DNS", async () => {
    const result = await resolvePublicHostAddresses("ok.example", async () => [
      { address: "1.1.1.1", family: 4 },
      { address: "8.8.4.4", family: 4 },
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("assertPublicHttpUrl", () => {
  it("requires HTTPS and rejects credentials", async () => {
    expect((await assertPublicHttpUrl("http://example.com/x")).ok).toBe(false);
    expect(
      (
        await assertPublicHttpUrl("https://user:pass@example.com/x", {
          lookupImpl: async () => [{ address: "1.1.1.1", family: 4 }],
        })
      ).ok
    ).toBe(false);
  });
});

describe("safeFetchPublicHtml streaming caps + redirects", () => {
  it("rejects Content-Length above max before reading body", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("x".repeat(100), {
        status: 200,
        headers: {
          "content-type": "text/html",
          "content-length": String(FETCH_MAX_BYTES + 1),
        },
      });
    }) as unknown as typeof fetch;

    const result = await safeFetchPublicHtml(
      "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001",
      {
        fetchImpl,
        lookupImpl: async () => [{ address: "1.1.1.1", family: 4 }],
        maxBytes: 1000,
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/too large/i);
  });

  it("aborts when chunked body exceeds max without waiting for end", async () => {
    const fetchImpl = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("a".repeat(600)));
          controller.enqueue(new TextEncoder().encode("b".repeat(600)));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;

    const result = await safeFetchPublicHtml(
      "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001",
      {
        fetchImpl,
        lookupImpl: async () => [{ address: "1.1.1.1", family: 4 }],
        maxBytes: 1000,
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/too large/i);
      expect(JSON.stringify(result)).not.toMatch(/aaaa/);
    }
  });

  it("rejects redirect from public host to private IP host", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("debary")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/secret" },
        });
      }
      return new Response("nope", { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const result = await safeFetchPublicHtml(
      "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001",
      {
        fetchImpl,
        lookupImpl: async (hostname) => {
          if (hostname === "127.0.0.1" || hostname.includes("127.")) {
            return [{ address: "127.0.0.1", family: 4 }];
          }
          return [{ address: "1.1.1.1", family: 4 }];
        },
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/private|blocked|HTTPS|loopback|localhost/i);
  });

  it("rejects redirect to credential-bearing URL", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(null, {
        status: 302,
        headers: {
          location:
            "https://user:secret@www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001",
        },
      });
    }) as unknown as typeof fetch;

    const result = await safeFetchPublicHtml(
      "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001",
      {
        fetchImpl,
        lookupImpl: async () => [{ address: "1.1.1.1", family: 4 }],
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/userinfo/i);
  });

  it("simulates DNS rebinding: connect-time lookup returns private → reject", async () => {
    let calls = 0;
    const result = await safeFetchPublicHtml(
      "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001",
      {
        fetchImpl: vi.fn(async () => {
          throw new Error("should not fetch after private resolution");
        }) as unknown as typeof fetch,
        lookupImpl: async () => {
          calls += 1;
          // First conceptual check would have been public; connect-time is private.
          return [{ address: "169.254.169.254", family: 4 }];
        },
      }
    );
    expect(result.ok).toBe(false);
    expect(calls).toBeGreaterThan(0);
    if (!result.ok) expect(result.reason).toMatch(/private/i);
  });
});
