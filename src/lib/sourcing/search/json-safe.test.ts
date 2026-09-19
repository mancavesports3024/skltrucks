import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseModelJsonObject,
  stripTrailingCommasOutsideStrings,
  truncateForLog,
} from "@/lib/sourcing/search/json-safe";
import { parseDiscoveryPayloadJson } from "@/lib/sourcing/search/openai-normalize";

const dir = resolve(__dirname, "../../../../fixtures/sourcing/json-malformed");

function load(name: string) {
  return readFileSync(resolve(dir, name), "utf8");
}

describe("json-safe trailing-comma cleanup", () => {
  it("parses trailing-comma JSON after narrow cleanup", () => {
    const raw = load("trailing-comma.json");
    expect(() => JSON.parse(raw)).toThrow();
    const parsed = parseModelJsonObject(raw);
    expect(parsed.usedTrailingCommaCleanup).toBe(true);
    expect(Array.isArray(parsed.value.listingUrls)).toBe(true);
    const discovery = parseDiscoveryPayloadJson(raw);
    expect(discovery.listingUrls[0]).toContain("example-dealer.com");
  });

  it("does not invent a parse for unquoted property names", () => {
    const raw = load("unquoted-property.json");
    expect(() => parseModelJsonObject(raw)).toThrow(/property name|JSON/i);
  });

  it("does not strip comments (narrow cleanup only)", () => {
    const raw = load("comments.json");
    expect(() => parseModelJsonObject(raw)).toThrow();
  });

  it("does not repair truncated JSON", () => {
    const raw = load("truncated.json");
    expect(() => parseModelJsonObject(raw)).toThrow();
  });

  it("stripTrailingCommasOutsideStrings leaves commas inside strings", () => {
    const input = '{"notes": "a, b,",}';
    expect(stripTrailingCommasOutsideStrings(input)).toBe('{"notes": "a, b,"}');
  });

  it("truncateForLog caps length", () => {
    const t = truncateForLog("x".repeat(500), 50);
    expect(t.length).toBeLessThan(80);
    expect(t).toContain("truncated");
  });
});
