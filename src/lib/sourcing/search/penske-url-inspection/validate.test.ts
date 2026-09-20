import { describe, expect, it } from "vitest";
import {
  isPenskeUrlInspectionEnabled,
  getPenskeUrlInspectionMaxToolCalls,
  PENSKE_URL_INSPECTION_MAX_URLS,
} from "@/lib/sourcing/search/penske-url-inspection/flag";
import { estimatePenskeInspectionMaxCostUsd } from "@/lib/sourcing/search/penske-url-inspection/cost";
import {
  parseAndValidatePenskeUnitUrls,
  validatePenskeUnitUrl,
} from "@/lib/sourcing/search/penske-url-inspection/validate";

const UNIT_A =
  "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-228474/";
const UNIT_B =
  "https://penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-416704";

describe("Penske URL inspection feature flag", () => {
  it("fails closed when missing or false", () => {
    expect(isPenskeUrlInspectionEnabled(undefined)).toBe(false);
    expect(isPenskeUrlInspectionEnabled("")).toBe(false);
    expect(isPenskeUrlInspectionEnabled("false")).toBe(false);
    expect(isPenskeUrlInspectionEnabled("0")).toBe(false);
    expect(isPenskeUrlInspectionEnabled("yes")).toBe(false);
  });

  it("enables only for true or 1", () => {
    expect(isPenskeUrlInspectionEnabled("true")).toBe(true);
    expect(isPenskeUrlInspectionEnabled("TRUE")).toBe(true);
    expect(isPenskeUrlInspectionEnabled("1")).toBe(true);
  });

  it("caps tool calls at max URLs", () => {
    expect(getPenskeUrlInspectionMaxToolCalls("10")).toBe(10);
    expect(getPenskeUrlInspectionMaxToolCalls("99")).toBe(PENSKE_URL_INSPECTION_MAX_URLS);
    expect(getPenskeUrlInspectionMaxToolCalls("bad")).toBe(PENSKE_URL_INSPECTION_MAX_URLS);
  });
});

describe("Penske unit URL validation", () => {
  it("accepts a valid Penske unit URL", () => {
    const r = validatePenskeUnitUrl(UNIT_A);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toContain("penskeusedtrucks.com");
      expect(r.url).toContain("/unit-228474");
      expect(r.url.startsWith("https://")).toBe(true);
    }
  });

  it("accepts both allowed hostnames", () => {
    expect(validatePenskeUnitUrl(UNIT_A).ok).toBe(true);
    expect(validatePenskeUnitUrl(UNIT_B).ok).toBe(true);
  });

  it("accepts 1 and 10 URLs; rejects 11", () => {
    const one = parseAndValidatePenskeUnitUrls(UNIT_A);
    expect(one.ok).toBe(true);

    const tenLines = Array.from({ length: 10 }, (_, i) =>
      `https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-${100000 + i}/`
    ).join("\n");
    const ten = parseAndValidatePenskeUnitUrls(tenLines);
    expect(ten.ok).toBe(true);
    if (ten.ok) expect(ten.urls).toHaveLength(10);

    const eleven = tenLines + "\nhttps://www.penskeusedtrucks.com/truck-types/x/unit-999999/";
    const bad = parseAndValidatePenskeUnitUrls(eleven);
    expect(bad.ok).toBe(false);
  });

  it("deduplicates normalized duplicates", () => {
    const r = parseAndValidatePenskeUnitUrls(
      `${UNIT_A}\n${UNIT_A.replace(/\/$/, "")}\nhttps://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-228474`
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.urls).toHaveLength(1);
  });

  it("rejects http, foreign host, userinfo, and fragments", () => {
    expect(
      validatePenskeUnitUrl(
        "http://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-1/"
      ).ok
    ).toBe(false);
    expect(
      validatePenskeUnitUrl(
        "https://example.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-1/"
      ).ok
    ).toBe(false);
    expect(
      validatePenskeUnitUrl(
        "https://user:pass@www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-1/"
      ).ok
    ).toBe(false);
    expect(
      validatePenskeUnitUrl(
        "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-1/#/vehicle/1"
      ).ok
    ).toBe(false);
  });

  it("rejects hub/category/search URLs", () => {
    expect(
      validatePenskeUnitUrl("https://www.penskeusedtrucks.com/search-inventory.html").ok
    ).toBe(false);
    expect(
      validatePenskeUnitUrl(
        "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/"
      ).ok
    ).toBe(false);
    expect(validatePenskeUnitUrl("https://www.penskeusedtrucks.com/search/?q=box").ok).toBe(
      false
    );
  });

  it("rejects session/token/client-id query parameters", () => {
    const base =
      "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-228474/";
    for (const q of [
      "token=abc",
      "authorization=Bearer%20x",
      "cookie=a",
      "session=1",
      "window_name=x",
      "client-id=ibm",
      "x-ibm-client-id=secret",
      "x-pnsk-client-id=secret",
      "auth=1",
    ]) {
      expect(validatePenskeUnitUrl(`${base}?${q}`).ok).toBe(false);
    }
  });

  it("rejects the complete request if any URL is invalid", () => {
    const r = parseAndValidatePenskeUnitUrls(`${UNIT_A}\nhttps://evil.example/unit-1/`);
    expect(r.ok).toBe(false);
  });
});

describe("Penske inspection cost estimate", () => {
  it("scales with URL count and stays under a quarter for 10 URLs", () => {
    expect(estimatePenskeInspectionMaxCostUsd(0)).toBe(0);
    expect(estimatePenskeInspectionMaxCostUsd(1)).toBeGreaterThan(0.01);
    expect(estimatePenskeInspectionMaxCostUsd(10)).toBeLessThan(0.25);
  });
});
