import { describe, expect, it } from "vitest";
import { getSourcingStaffAllowlist, isSourcingStaffEmail } from "@/lib/sourcing/staff";

describe("sourcing staff allowlist", () => {
  it("allows any signed-in email when SOURCING_STAFF_EMAILS is missing or empty", () => {
    expect(getSourcingStaffAllowlist("")).toEqual([]);
    expect(getSourcingStaffAllowlist(undefined)).toEqual([]);
    expect(isSourcingStaffEmail("skltrucksllc@gmail.com", [])).toBe(true);
    expect(isSourcingStaffEmail("coworker@example.com", getSourcingStaffAllowlist(""))).toBe(
      true
    );
    expect(isSourcingStaffEmail(null, [])).toBe(false);
  });

  it("when set, only listed emails pass", () => {
    const list = getSourcingStaffAllowlist("a@skl.com, B@SKL.COM  c@skl.com");
    expect(list).toEqual(["a@skl.com", "b@skl.com", "c@skl.com"]);
    expect(isSourcingStaffEmail("b@skl.com", list)).toBe(true);
    expect(isSourcingStaffEmail("random@example.com", list)).toBe(false);
    expect(isSourcingStaffEmail(null, list)).toBe(false);
  });
});
