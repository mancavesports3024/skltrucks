/**
 * Regression: Node 22 https.request lookup with options.all=true.
 * Wrong callback shape → "Invalid IP address: undefined".
 */
import { createServer as createHttpsServer } from "node:https";
import https from "node:https";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  classifySafeFetchFailureReason,
  createPinnedLookup,
  type PinnedLookupCallback,
  type ResolvedAddress,
} from "@/lib/sourcing/search/discovery-inspect/fetch-page";
import { staffValidationFailureReason } from "@/lib/sourcing/search/discovery-inspect/validate-url";

function invokeLookup(
  lookup: ReturnType<typeof createPinnedLookup>,
  options: { all?: boolean } | undefined
): Promise<{ address?: string; family?: number; addresses?: Array<{ address: string; family: number }> }> {
  return new Promise((resolve, reject) => {
    const cb: PinnedLookupCallback = (
      err: NodeJS.ErrnoException | null,
      addressOrList: string | Array<{ address: string; family: number }>,
      family?: number
    ) => {
      if (err) {
        reject(err);
        return;
      }
      if (Array.isArray(addressOrList)) {
        resolve({ addresses: addressOrList });
        return;
      }
      resolve({ address: addressOrList, family });
    };
    lookup("example.com", options ?? {}, cb);
  });
}

describe("createPinnedLookup callback shapes", () => {
  const ipv4: ResolvedAddress = { address: "1.1.1.1", family: 4 };
  const ipv6: ResolvedAddress = { address: "2001:4860:4860::8888", family: 6 };

  it("all=false / undefined returns single address + family (IPv4)", async () => {
    const lookup = createPinnedLookup(ipv4);
    const a = await invokeLookup(lookup, { all: false });
    expect(a.addresses).toBeUndefined();
    expect(a.address).toBe("1.1.1.1");
    expect(a.family).toBe(4);
    expect(a.address).not.toBeUndefined();

    const b = await invokeLookup(lookup, undefined);
    expect(b.address).toBe("1.1.1.1");
    expect(b.family).toBe(4);
  });

  it("all=true returns address-record array (IPv4)", async () => {
    const lookup = createPinnedLookup(ipv4);
    const result = await invokeLookup(lookup, { all: true });
    expect(result.address).toBeUndefined();
    expect(result.addresses).toEqual([{ address: "1.1.1.1", family: 4 }]);
    expect(result.addresses![0].address).not.toBeUndefined();
    expect(typeof result.addresses![0].address).toBe("string");
  });

  it("all=false and all=true work for IPv6 pinned addresses", async () => {
    const lookup = createPinnedLookup(ipv6);
    const single = await invokeLookup(lookup, { all: false });
    expect(single.address).toBe("2001:4860:4860::8888");
    expect(single.family).toBe(6);

    const all = await invokeLookup(lookup, { all: true });
    expect(all.addresses).toEqual([
      { address: "2001:4860:4860::8888", family: 6 },
    ]);
    expect(all.addresses![0].address).toBeTruthy();
  });

  it("never delivers undefined address into the callback", async () => {
    const lookup = createPinnedLookup(ipv4);
    for (const options of [{ all: true }, { all: false }, undefined] as const) {
      const result = await invokeLookup(lookup, options);
      if (result.addresses) {
        for (const row of result.addresses) {
          expect(row.address).toBeDefined();
          expect(row.address).not.toBe("undefined");
          expect(row.address.length).toBeGreaterThan(0);
          expect(row.family === 4 || row.family === 6).toBe(true);
        }
      } else {
        expect(result.address).toBeDefined();
        expect(result.address).not.toBe("undefined");
        expect(result.address!.length).toBeGreaterThan(0);
      }
    }
  });

  it("rejects constructing a lookup without a concrete IP", () => {
    expect(() =>
      createPinnedLookup({ address: "", family: 4 })
    ).toThrow(/concrete public IP/i);
    expect(() =>
      createPinnedLookup({ address: "not-an-ip", family: 4 })
    ).toThrow(/concrete public IP/i);
  });
});

describe("classifySafeFetchFailureReason + staffValidationFailureReason", () => {
  it("maps Invalid IP address: undefined to HTTPS connection configuration failure", () => {
    const reason = classifySafeFetchFailureReason("Invalid IP address: undefined");
    expect(reason).toMatch(/HTTPS connection configuration failure/i);
    expect(reason).not.toMatch(/403|bot|hub|deadline|private/i);

    const staff = staffValidationFailureReason({
      ok: false,
      reason,
    });
    expect(staff.outcome).toBe("unverified");
    expect(staff.reason).toMatch(/HTTPS connection configuration failure/i);
  });

  it("keeps HTTP 403/bot, hub, deadline, and DNS/private distinct", () => {
    expect(
      staffValidationFailureReason({ ok: false, reason: "HTTP 403", status: 403 }).reason
    ).toMatch(/HTTP 403.*bot\/access/i);

    expect(
      staffValidationFailureReason({
        ok: false,
        reason: "hostname resolves to private IP",
      }).outcome
    ).toBe("rejected");
    expect(
      staffValidationFailureReason({
        ok: false,
        reason: "hostname resolves to private IP",
      }).reason
    ).toMatch(/private/i);

    expect(
      staffValidationFailureReason({ ok: false, reason: "timeout" }).reason
    ).toMatch(/deadline/i);

    expect(
      staffValidationFailureReason({ ok: false, reason: "DNS lookup failed" }).reason
    ).toMatch(/DNS/i);
  });
});

/**
 * Production-style Node 22 path: https.request invokes lookup with all=true.
 * Local TLS only — no Tavily / OpenAI / live dealer URLs.
 */
describe("Node 22 https.request pinned lookup (local TLS)", () => {
  let port = 0;
  let server: ReturnType<typeof createHttpsServer>;
  let tmpDir = "";

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pinned-lookup-"));
    const keyPath = path.join(tmpDir, "key.pem");
    const certPath = path.join(tmpDir, "cert.pem");
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 1 -nodes -subj /CN=localhost`,
      { stdio: "ignore" }
    );
    server = createHttpsServer(
      {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      },
      (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body>ok</body></html>");
      }
    );
  });

  afterAll(() => {
    server?.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function listen(): Promise<number> {
    return new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        resolve(port);
      });
    });
  }

  it("legacy single-form callback throws Invalid IP address: undefined when all=true", async () => {
    await listen();
    const seen: Array<{ all?: boolean }> = [];
    await new Promise<void>((resolve, reject) => {
      const req = https.request(
        {
          hostname: "localhost",
          port,
          path: "/",
          method: "GET",
          servername: "localhost",
          rejectUnauthorized: false,
          lookup(hostname, options, cb) {
            seen.push({ all: options?.all });
            // Intentionally wrong for Node 22 all=true (pre-hotfix behavior).
            (cb as (err: Error | null, address: string, family: number) => void)(
              null,
              "127.0.0.1",
              4
            );
          },
        },
        () => reject(new Error("unexpected success with broken lookup"))
      );
      req.on("error", (err) => {
        expect(seen.some((s) => s.all === true)).toBe(true);
        expect(err.message).toBe("Invalid IP address: undefined");
        resolve();
      });
      req.end();
    });
  });

  it("createPinnedLookup dual form completes without Invalid IP address: undefined", async () => {
    if (!port) await listen();
    const pinned = createPinnedLookup({ address: "127.0.0.1", family: 4 });
    const seen: Array<{ all?: boolean }> = [];

    await new Promise<void>((resolve, reject) => {
      const req = https.request(
        {
          hostname: "localhost",
          port,
          path: "/",
          method: "GET",
          servername: "localhost",
          rejectUnauthorized: false,
          lookup(hostname, options, cb) {
            seen.push({ all: options?.all });
            pinned(hostname, options, cb);
          },
        },
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(seen.some((s) => s.all === true)).toBe(true);
          expect(res.statusCode).not.toBeUndefined();
          res.resume();
          res.on("end", () => resolve());
        }
      );
      req.on("error", (err) => {
        reject(
          new Error(
            `pinned lookup HTTPS failed: ${err.message} (seen all=${JSON.stringify(seen)})`
          )
        );
      });
      req.end();
    });
  });
});
