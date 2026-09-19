import { describe, expect, it } from "vitest";
import {
  getSourcingStaffAllowlist,
  isSourcingStaffAllowlistConfigured,
  isSourcingStaffEmail,
} from "@/lib/sourcing/staff";

describe("fail-closed sourcing staff allowlist", () => {
  it("denies everyone when SOURCING_STAFF_EMAILS is missing, empty, or malformed", () => {
    expect(getSourcingStaffAllowlist(undefined)).toEqual([]);
    expect(getSourcingStaffAllowlist("")).toEqual([]);
    expect(getSourcingStaffAllowlist("   ")).toEqual([]);
    expect(getSourcingStaffAllowlist("not-an-email,,,")).toEqual([]);
    expect(isSourcingStaffAllowlistConfigured(undefined)).toBe(false);
    expect(isSourcingStaffAllowlistConfigured("")).toBe(false);

    expect(isSourcingStaffEmail("skltrucksllc@gmail.com", [])).toBe(false);
    expect(isSourcingStaffEmail("admin@example.com", getSourcingStaffAllowlist(""))).toBe(
      false
    );
    expect(isSourcingStaffEmail(null, [])).toBe(false);
  });

  it("allows only emails explicitly listed (normalized)", () => {
    const list = getSourcingStaffAllowlist("a@skl.com, B@SKL.COM  c@skl.com");
    expect(list).toEqual(["a@skl.com", "b@skl.com", "c@skl.com"]);
    expect(isSourcingStaffAllowlistConfigured("a@skl.com")).toBe(true);
    expect(isSourcingStaffEmail("b@skl.com", list)).toBe(true);
    expect(isSourcingStaffEmail("random@example.com", list)).toBe(false);
    expect(isSourcingStaffEmail(null, list)).toBe(false);
  });

  it("authenticated admin with empty/unset env is denied at application layer", () => {
    // Inventory /admin may still work; sourcing must not.
    expect(isSourcingStaffEmail("skltrucksllc@gmail.com", getSourcingStaffAllowlist(undefined))).toBe(
      false
    );
    expect(isSourcingStaffEmail("skltrucksllc@gmail.com", getSourcingStaffAllowlist(""))).toBe(
      false
    );
  });
});

describe("application authorization matrix (env ∩ DB)", () => {
  function appAllows(opts: {
    email: string;
    envList: string[];
    dbActiveStaff: boolean;
  }): boolean {
    if (!isSourcingStaffEmail(opts.email, opts.envList)) return false;
    if (!opts.dbActiveStaff) return false;
    return true;
  }

  it("authorized in env and DB → allowed", () => {
    expect(
      appAllows({
        email: "skltrucksllc@gmail.com",
        envList: ["skltrucksllc@gmail.com"],
        dbActiveStaff: true,
      })
    ).toBe(true);
  });

  it("env only → denied", () => {
    expect(
      appAllows({
        email: "skltrucksllc@gmail.com",
        envList: ["skltrucksllc@gmail.com"],
        dbActiveStaff: false,
      })
    ).toBe(false);
  });

  it("DB only → denied", () => {
    expect(
      appAllows({
        email: "skltrucksllc@gmail.com",
        envList: [],
        dbActiveStaff: true,
      })
    ).toBe(false);
  });
});
