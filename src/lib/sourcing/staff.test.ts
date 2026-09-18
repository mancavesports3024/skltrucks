import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOURCING_STAFF_EMAILS,
  getSourcingStaffAllowlist,
  isSourcingStaffEmail,
} from "@/lib/sourcing/staff";

describe("sourcing staff allowlist", () => {
  it("defaults to the SKL primary email when env is empty", () => {
    expect(getSourcingStaffAllowlist("")).toEqual(DEFAULT_SOURCING_STAFF_EMAILS);
    expect(getSourcingStaffAllowlist(undefined)).toEqual(DEFAULT_SOURCING_STAFF_EMAILS);
    expect(isSourcingStaffEmail("skltrucksllc@gmail.com")).toBe(true);
  });

  it("parses SOURCING_STAFF_EMAILS and rejects unknown accounts", () => {
    const list = getSourcingStaffAllowlist("a@skl.com, B@SKL.COM  c@skl.com");
    expect(list).toEqual(["a@skl.com", "b@skl.com", "c@skl.com"]);
    expect(isSourcingStaffEmail("b@skl.com", list)).toBe(true);
    expect(isSourcingStaffEmail("random@example.com", list)).toBe(false);
    expect(isSourcingStaffEmail(null, list)).toBe(false);
  });
});
