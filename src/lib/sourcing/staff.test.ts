import { describe, expect, it } from "vitest";
import {
  EXAMPLE_SOURCING_STAFF_EMAIL,
  getSourcingStaffAllowlist,
  isSourcingStaffEmail,
} from "@/lib/sourcing/staff";

describe("sourcing staff allowlist", () => {
  it("denies access when SOURCING_STAFF_EMAILS is missing or empty", () => {
    expect(getSourcingStaffAllowlist("")).toEqual([]);
    expect(getSourcingStaffAllowlist(undefined)).toEqual([]);
    expect(isSourcingStaffEmail(EXAMPLE_SOURCING_STAFF_EMAIL, [])).toBe(false);
    expect(isSourcingStaffEmail("skltrucksllc@gmail.com", getSourcingStaffAllowlist(""))).toBe(
      false
    );
  });

  it("parses explicit SOURCING_STAFF_EMAILS and rejects unknown accounts", () => {
    const list = getSourcingStaffAllowlist("a@skl.com, B@SKL.COM  c@skl.com");
    expect(list).toEqual(["a@skl.com", "b@skl.com", "c@skl.com"]);
    expect(isSourcingStaffEmail("b@skl.com", list)).toBe(true);
    expect(isSourcingStaffEmail("random@example.com", list)).toBe(false);
    expect(isSourcingStaffEmail(null, list)).toBe(false);
  });
});
