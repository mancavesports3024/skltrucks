import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getSourcingStaffAllowlist,
  isSourcingStaffAllowlistConfigured,
  isSourcingStaffEmail,
} from "@/lib/sourcing/staff";

describe("sourcing staff allowlist (optional narrow)", () => {
  const prev = process.env.SOURCING_STAFF_EMAILS;

  beforeEach(() => {
    delete process.env.SOURCING_STAFF_EMAILS;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.SOURCING_STAFF_EMAILS;
    else process.env.SOURCING_STAFF_EMAILS = prev;
  });

  it("empty/unset allowlist allows any non-empty email at the app layer only", () => {
    expect(getSourcingStaffAllowlist(undefined)).toEqual([]);
    expect(getSourcingStaffAllowlist("")).toEqual([]);
    expect(getSourcingStaffAllowlist("   ")).toEqual([]);
    expect(isSourcingStaffAllowlistConfigured(undefined)).toBe(false);
    expect(isSourcingStaffAllowlistConfigured("")).toBe(false);

    expect(isSourcingStaffEmail("skltrucksllc@gmail.com", [])).toBe(true);
    expect(isSourcingStaffEmail("admin@example.com", getSourcingStaffAllowlist(""))).toBe(
      true
    );
    expect(isSourcingStaffEmail(null, [])).toBe(false);
    expect(isSourcingStaffEmail("", [])).toBe(false);
  });

  it("when set, allows only emails explicitly listed (normalized)", () => {
    const list = getSourcingStaffAllowlist("a@skl.com, B@SKL.COM  c@skl.com");
    expect(list).toEqual(["a@skl.com", "b@skl.com", "c@skl.com"]);
    expect(isSourcingStaffAllowlistConfigured("a@skl.com")).toBe(true);
    expect(isSourcingStaffEmail("b@skl.com", list)).toBe(true);
    expect(isSourcingStaffEmail("random@example.com", list)).toBe(false);
    expect(isSourcingStaffEmail(null, list)).toBe(false);
  });

  it("ignores malformed tokens without @", () => {
    expect(getSourcingStaffAllowlist("not-an-email,,,")).toEqual([]);
    expect(isSourcingStaffEmail("admin@example.com", getSourcingStaffAllowlist("not-an-email"))).toBe(
      true
    );
  });
});

describe("application authorization (env allowlist + DB RPC)", () => {
  function appAllows(opts: {
    email: string | null;
    envList: string[];
    authenticatedRpc: boolean;
  }): boolean {
    if (!isSourcingStaffEmail(opts.email, opts.envList)) return false;
    if (!opts.authenticatedRpc) return false;
    return true;
  }

  it("signed-in with empty env still requires DB RPC true (directory)", () => {
    expect(
      appAllows({
        email: "teammate@example.com",
        envList: [],
        authenticatedRpc: false,
      })
    ).toBe(false);
    expect(
      appAllows({
        email: "teammate@example.com",
        envList: [],
        authenticatedRpc: true,
      })
    ).toBe(true);
  });

  it("empty/missing JWT email denies", () => {
    expect(appAllows({ email: null, envList: [], authenticatedRpc: true })).toBe(false);
    expect(appAllows({ email: "", envList: [], authenticatedRpc: true })).toBe(false);
  });

  it("optional env allowlist can still narrow further", () => {
    expect(
      appAllows({
        email: "other@example.com",
        envList: ["skltrucksllc@gmail.com"],
        authenticatedRpc: true,
      })
    ).toBe(false);
    expect(
      appAllows({
        email: "skltrucksllc@gmail.com",
        envList: ["skltrucksllc@gmail.com"],
        authenticatedRpc: true,
      })
    ).toBe(true);
  });
});
