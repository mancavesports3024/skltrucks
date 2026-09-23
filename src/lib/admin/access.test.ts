import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isAdminUser } from "@/lib/admin/is-admin-user";
import type { User } from "@supabase/supabase-js";

describe("shared Admin authorization", () => {
  it("isAdminUser is true only for authenticated users", () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
    expect(isAdminUser({ id: "u1" } as User)).toBe(true);
  });

  it("requireSourcingStaff is an alias of requireAdmin (same module decision)", () => {
    const sourcingAccess = readFileSync(
      path.join(process.cwd(), "src/lib/sourcing/access.ts"),
      "utf8"
    );
    const adminAccess = readFileSync(
      path.join(process.cwd(), "src/lib/admin/access.ts"),
      "utf8"
    );
    expect(sourcingAccess).toMatch(/return requireAdmin\(\)/);
    expect(sourcingAccess).not.toMatch(/isSourcingStaffEmail/);
    expect(sourcingAccess).not.toMatch(/SOURCING_STAFF_EMAILS/);
    expect(adminAccess).toMatch(/isAdminUser/);
    expect(adminAccess).toMatch(/getUser/);
  });

  it("middleware uses isAdminUser and has no sourcing email gate", () => {
    const mw = readFileSync(
      path.join(process.cwd(), "src/lib/supabase/middleware.ts"),
      "utf8"
    );
    expect(mw).toMatch(/isAdminUser/);
    expect(mw).not.toMatch(/isSourcingStaffEmail/);
    expect(mw).not.toMatch(/SOURCING_STAFF_EMAILS/);
    expect(mw).not.toMatch(/sourcing_forbidden_email/);
  });

  it("inventory products RLS uses authenticated (Admin-equivalent)", () => {
    const schema = readFileSync(
      path.join(process.cwd(), "supabase/schema.sql"),
      "utf8"
    );
    expect(schema).toMatch(
      /Authenticated users full access[\s\S]*auth\.role\(\) = 'authenticated'/
    );
  });
});
