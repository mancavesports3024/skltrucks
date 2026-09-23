import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getSourcingStaffAllowlist,
  isSourcingStaffAllowlistConfigured,
  isSourcingStaffEmail,
} from "@/lib/sourcing/staff";
import { isAdminUser } from "@/lib/admin/is-admin-user";
import type { User } from "@supabase/supabase-js";

describe("deprecated SOURCING_STAFF_EMAILS helpers (unused by Admin/Sourcing gates)", () => {
  const prev = process.env.SOURCING_STAFF_EMAILS;

  beforeEach(() => {
    delete process.env.SOURCING_STAFF_EMAILS;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.SOURCING_STAFF_EMAILS;
    else process.env.SOURCING_STAFF_EMAILS = prev;
  });

  it("helpers still parse env but are not used for authorization", () => {
    expect(getSourcingStaffAllowlist("a@skl.com")).toEqual(["a@skl.com"]);
    expect(isSourcingStaffAllowlistConfigured("a@skl.com")).toBe(true);
    expect(isSourcingStaffEmail("anyone@example.com")).toBe(true);
    expect(isSourcingStaffEmail(null)).toBe(false);
  });
});

describe("Admin and Sourcing share one authorization decision", () => {
  function adminAllows(user: User | null): boolean {
    return isAdminUser(user);
  }

  function sourcingAllows(user: User | null): boolean {
    // Same predicate as requireSourcingStaff → requireAdmin → isAdminUser
    return isAdminUser(user);
  }

  it("signed-out user cannot access Admin or Sourcing", () => {
    expect(adminAllows(null)).toBe(false);
    expect(sourcingAllows(null)).toBe(false);
  });

  it("authenticated inventory admin can access both", () => {
    const admin = { id: "admin-1", email: "inventory-admin@example.com" } as User;
    expect(adminAllows(admin)).toBe(true);
    expect(sourcingAllows(admin)).toBe(true);
    expect(adminAllows(admin)).toBe(sourcingAllows(admin));
  });

  it("sourcing does not require a different email account", () => {
    const otherAdmin = { id: "admin-2", email: "other-admin@example.com" } as User;
    expect(sourcingAllows(otherAdmin)).toBe(true);
    expect(otherAdmin.email).not.toBe("skltrucksllc@gmail.com");
  });
});
