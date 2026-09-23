import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import path from "node:path";

/**
 * Guard: sourcing authorization must stay identical to inventory Admin
 * (any authenticated Supabase user). Do not reintroduce a separate
 * sourcing_authorized_staff or SOURCING_STAFF_EMAILS app gate.
 */
describe("sourcing access Admin-aligned regression guards", () => {
  const accessSrc = readFileSync(
    path.join(process.cwd(), "src/lib/sourcing/access.ts"),
    "utf8"
  );
  const adminAlignedSql = readFileSync(
    path.join(process.cwd(), "supabase/sourcing-rls-admin-aligned.sql"),
    "utf8"
  );
  const baseSchemaSrc = readFileSync(
    path.join(process.cwd(), "supabase/sourcing-schema.sql"),
    "utf8"
  );

  function functionBody(sql: string): string {
    const m = sql.match(
      /create or replace function public\.is_sourcing_staff\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/i
    );
    if (!m) throw new Error("is_sourcing_staff body missing");
    return m[1];
  }

  it("requireSourcingStaff delegates to requireAdmin only", () => {
    expect(accessSrc).toMatch(/requireAdmin/);
    expect(accessSrc).toMatch(/return requireAdmin\(\)/);
    expect(accessSrc).not.toMatch(/isSourcingStaffEmail/);
    expect(accessSrc).not.toMatch(/sourcing_authorized_staff/);
    expect(accessSrc).not.toMatch(/SOURCING_STAFF_EMAILS/);
  });

  it("admin-aligned SQL matches inventory authenticated bar", () => {
    const body = functionBody(adminAlignedSql);
    expect(body).toMatch(/auth\.role\(\)\s*=\s*'authenticated'/);
    expect(body).not.toMatch(/sourcing_authorized_staff/);
  });

  it("base schema is_sourcing_staff matches Admin authenticated bar", () => {
    const body = functionBody(baseSchemaSrc);
    expect(body).toMatch(/auth\.role\(\)\s*=\s*'authenticated'/);
    expect(body).not.toMatch(/active is true/);
  });

  it("admin-aligned SQL retains sourcing_authorized_staff without dropping it", () => {
    expect(adminAlignedSql).toMatch(/sourcing_authorized_staff/);
    expect(adminAlignedSql).not.toMatch(/drop table.*sourcing_authorized_staff/i);
    expect(adminAlignedSql).not.toMatch(/delete from public\.sourcing_authorized_staff/i);
  });
});
