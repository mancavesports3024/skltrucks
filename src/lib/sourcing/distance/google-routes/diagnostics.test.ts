import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeGoogleRoute,
  GOOGLE_MAPS_ROUTES_API_KEY_ENV,
} from "@/lib/sourcing/distance/google-routes/client";
import {
  extractGoogleErrorFields,
  GOOGLE_ROUTES_FAILED_EVENT,
  logGoogleRoutesFailure,
  parseGoogleErrorResponseText,
  sanitizeGoogleErrorEnum,
  sanitizeGoogleErrorMessage,
  type GoogleRoutesFailedLog,
} from "@/lib/sourcing/distance/google-routes/diagnostics";
import { GOOGLE_ROUTES_PROVIDER } from "@/lib/sourcing/distance/google-routes/types";

afterEach(() => {
  vi.restoreAllMocks();
});

const ALLOWED_KEYS = new Set([
  "event",
  "httpStatus",
  "googleErrorStatus",
  "googleErrorReason",
  "googleErrorMessage",
  "failureStage",
  "vercelEnv",
  "provider",
]);

const FORBIDDEN_IN_LOG =
  /AIza[0-9A-Za-z_-]+|test-secret-api-key-value|X-Goog-Api-Key|Authorization|Cookie|Bearer\s|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|GOOGLE_MAPS_ROUTES_API_KEY|lead-[a-f0-9-]{8,}|37\.07522|-94\.50126|inspectionUrl|https?:\/\//i;

describe("google routes diagnostics sanitizers", () => {
  it("accepts Google-style status/reason enums and rejects free text", () => {
    expect(sanitizeGoogleErrorEnum("PERMISSION_DENIED")).toBe("PERMISSION_DENIED");
    expect(sanitizeGoogleErrorEnum("API_KEY_INVALID")).toBe("API_KEY_INVALID");
    expect(sanitizeGoogleErrorEnum("not a status")).toBeNull();
    expect(sanitizeGoogleErrorEnum("AIzaSyC_fake_key_material_here")).toBeNull();
    expect(sanitizeGoogleErrorEnum({ x: 1 })).toBeNull();
  });

  it("redacts API keys, JWTs, URLs, and coords from Google messages", () => {
    const msg = sanitizeGoogleErrorMessage(
      'API key AIzaSyC_this_is_not_a_real_key_abcdefg invalid; see https://console.cloud.google.com/x?key=secret; near 37.07522,-94.50126; Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb'
    );
    expect(msg).toBeTruthy();
    expect(msg!).not.toMatch(/AIza/);
    expect(msg!).not.toMatch(/Bearer/i);
    expect(msg!).not.toMatch(/eyJ/);
    expect(msg!).not.toMatch(/https?:\/\//i);
    expect(msg!).not.toMatch(/37\.07522/);
    expect(msg!).not.toMatch(/key=secret/i);
    expect(msg!).toMatch(/\[REDACTED\]|\[URL\]|\[COORDS\]/);
  });

  it("extracts status/reason/message from Google error JSON without leaking details", () => {
    const extracted = extractGoogleErrorFields({
      error: {
        code: 403,
        message: "Requests from this API key are blocked. Key=AIzaSyC_blocked_example_key_zzzz",
        status: "PERMISSION_DENIED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "API_KEY_HTTP_REFERRER_BLOCKED",
            domain: "googleapis.com",
            metadata: {
              service: "routes.googleapis.com",
              consumer: "projects/123",
              apiKey: "AIzaSyC_blocked_example_key_zzzz",
            },
          },
        ],
      },
    });
    expect(extracted.status).toBe("PERMISSION_DENIED");
    expect(extracted.reason).toBe("API_KEY_HTTP_REFERRER_BLOCKED");
    expect(extracted.message).toBeTruthy();
    expect(JSON.stringify(extracted)).not.toMatch(/AIza/);
    expect(JSON.stringify(extracted)).not.toMatch(/projects\/123|metadata|consumer/i);
  });

  it("parseGoogleErrorResponseText never surfaces raw body content beyond allowlisted fields", () => {
    const raw = JSON.stringify({
      error: {
        status: "UNAUTHENTICATED",
        message: "Invalid API key",
        details: [{ reason: "API_KEY_INVALID" }],
      },
      secretHeaderDump: "X-Goog-Api-Key: test-secret-api-key-value",
    });
    const parsed = parseGoogleErrorResponseText(raw);
    expect(parsed.status).toBe("UNAUTHENTICATED");
    expect(parsed.reason).toBe("API_KEY_INVALID");
    expect(JSON.stringify(parsed)).not.toMatch(/secretHeaderDump|X-Goog|test-secret/i);
  });
});

describe("logGoogleRoutesFailure allowlist", () => {
  it("emits only allowlisted fields and never secrets/headers/coords/lead ids", () => {
    const emitted: GoogleRoutesFailedLog[] = [];
    const payload = logGoogleRoutesFailure({
      httpStatus: 403,
      googleErrorStatus: "PERMISSION_DENIED",
      googleErrorReason: "API_KEY_SERVICE_BLOCKED",
      googleErrorMessage:
        "Key AIzaSyC_should_never_appear_in_logs_xx blocked for https://evil.example/path",
      failureStage: "request",
      env: { NODE_ENV: "test", VERCEL_ENV: "production" } as NodeJS.ProcessEnv,
      emit: (p) => emitted.push(p),
    });

    expect(emitted).toHaveLength(1);
    expect(payload.event).toBe(GOOGLE_ROUTES_FAILED_EVENT);
    expect(payload.provider).toBe(GOOGLE_ROUTES_PROVIDER);
    expect(payload.vercelEnv).toBe("production");
    expect(payload.failureStage).toBe("request");
    expect(payload.httpStatus).toBe(403);
    expect(payload.googleErrorStatus).toBe("PERMISSION_DENIED");
    expect(payload.googleErrorReason).toBe("API_KEY_SERVICE_BLOCKED");
    expect(payload.googleErrorMessage).not.toMatch(/AIza|https?:\/\//i);

    const keys = Object.keys(payload);
    expect(keys.every((k) => ALLOWED_KEYS.has(k))).toBe(true);
    expect(keys).toHaveLength(ALLOWED_KEYS.size);

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(FORBIDDEN_IN_LOG);
    // Explicit denylist from product requirements (field names / secret material — not Google reason enums)
    expect(serialized).not.toMatch(/"apiKey"|"api_key"|"headers"|"cookie"|"jwt"|"leadId"|"destLat"|"destLng"|"originLat"|"inspectionUrl"/i);
    expect(serialized).not.toMatch(/X-Goog-Api-Key|Authorization:|Cookie:/i);
  });

  it("rejects injected forbidden keys if a caller tries to smuggle them via message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const payload = logGoogleRoutesFailure({
      httpStatus: 401,
      googleErrorMessage: `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig Cookie: session=abc X-Goog-Api-Key: test-secret-api-key-value lead-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee 39.099700,-94.578600`,
      failureStage: "request",
      env: { NODE_ENV: "test", VERCEL_ENV: "preview" } as NodeJS.ProcessEnv,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0] ?? "");
    expect(() => JSON.parse(line)).not.toThrow();
    expect(line).not.toMatch(FORBIDDEN_IN_LOG);
    expect(payload.googleErrorMessage).not.toMatch(FORBIDDEN_IN_LOG);
    expect(JSON.parse(line).event).toBe(GOOGLE_ROUTES_FAILED_EVENT);
  });
});

describe("computeGoogleRoute logs safe diagnostics on 4xx", () => {
  it("logs google_routes_failed with HTTP status and sanitized Google fields; staff message stays safe", async () => {
    const apiKey = "test-secret-api-key-value-never-log";
    const googleBody = {
      error: {
        code: 403,
        message: `API key not valid. Please pass a valid API key. Key=${apiKey}`,
        status: "PERMISSION_DENIED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "API_KEY_INVALID",
            metadata: { apiKey },
          },
        ],
      },
    };

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      // Prove the real request still carries the key in headers (not logged).
      const headers = init?.headers as Record<string, string>;
      expect(headers["X-Goog-Api-Key"]).toBe(apiKey);
      return new Response(JSON.stringify(googleBody), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          Cookie: "session=should-never-log",
        },
      });
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await computeGoogleRoute({
      originLat: 37.07522,
      originLng: -94.50126,
      destLat: 39.0997,
      destLng: -94.5786,
      apiKey,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe("auth");
      expect(result.message).toMatch(/authentication failed/i);
      expect(result.message).not.toMatch(new RegExp(apiKey, "i"));
      expect(JSON.stringify(result)).not.toMatch(/AIza|X-Goog|Cookie|37\.07522|39\.0997/i);
    }

    expect(consoleSpy).toHaveBeenCalled();
    const logLine = String(consoleSpy.mock.calls.find((c) => String(c[0]).includes(GOOGLE_ROUTES_FAILED_EVENT))?.[0] ?? "");
    expect(logLine).toBeTruthy();
    const parsed = JSON.parse(logLine) as GoogleRoutesFailedLog;
    expect(parsed.event).toBe(GOOGLE_ROUTES_FAILED_EVENT);
    expect(parsed.httpStatus).toBe(403);
    expect(parsed.googleErrorStatus).toBe("PERMISSION_DENIED");
    expect(parsed.googleErrorReason).toBe("API_KEY_INVALID");
    expect(parsed.failureStage).toBe("request");
    expect(parsed.provider).toBe(GOOGLE_ROUTES_PROVIDER);
    expect(Object.keys(parsed).every((k) => ALLOWED_KEYS.has(k))).toBe(true);
    expect(logLine).not.toMatch(FORBIDDEN_IN_LOG);
    expect(logLine).not.toContain(apiKey);
    expect(logLine).not.toMatch(/X-Goog-Api-Key|Cookie|session=/i);
    expect(logLine).not.toMatch(/37\.07522|-94\.50126|39\.0997|-94\.5786/);
    expect(logLine).not.toMatch(/GOOGLE_MAPS_ROUTES_API_KEY|request headers|Authorization/i);
    // Ensure env var name from process isn't leaked via accidental spread
    expect(logLine).not.toContain(GOOGLE_MAPS_ROUTES_API_KEY_ENV);
  });

  it("does not log secrets when response body is non-JSON 401", async () => {
    const apiKey = "another-secret-key-value-zzzz";
    const fetchImpl = vi.fn(
      async () =>
        new Response(`Unauthorized raw body with ${apiKey} and header echo X-Goog-Api-Key: ${apiKey}`, {
          status: 401,
        })
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await computeGoogleRoute({
      originLat: 1,
      originLng: 2,
      destLat: 3,
      destLng: 4,
      apiKey,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe("auth");
    const logLine = String(consoleSpy.mock.calls[0]?.[0] ?? "");
    const parsed = JSON.parse(logLine) as GoogleRoutesFailedLog;
    expect(parsed.httpStatus).toBe(401);
    expect(parsed.googleErrorStatus).toBeNull();
    expect(parsed.googleErrorMessage).toBeNull();
    expect(logLine).not.toContain(apiKey);
    expect(logLine).not.toMatch(/X-Goog|Unauthorized raw/i);
  });
});
