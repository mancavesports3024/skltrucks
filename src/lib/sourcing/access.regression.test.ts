import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import path from "node:path";

/**
 * Permanent guard: private sourcing must not trust auth.role()=authenticated alone.
 * Database is_sourcing_staff() must require an active sourcing_authorized_staff row.
 * Application requireSourcingStaff must call the RPC (not query the directory table
 * client-side) and must also enforce SOURCING_STAFF_EMAILS.
 */
describe("sourcing access fail-closed regression guards", () => {
  const accessSrc = readFileSync(
    path.join(process.cwd(), "src/lib/sourcing/access.ts"),
    "utf8"
  );
  const hotfixSrc = readFileSync(
    path.join(process.cwd(), "supabase/sourcing-staff-rls-failclosed.sql"),
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

  it("requireSourcingStaff enforces env allowlist and is_sourcing_staff RPC", () => {
    expect(accessSrc).toMatch(/isSourcingStaffEmail/);
    expect(accessSrc).toMatch(/\.rpc\(\s*["']is_sourcing_staff["']\s*\)/);
    expect(accessSrc).not.toMatch(/from\(\s*["']sourcing_authorized_staff["']\s*\)/);
    expect(accessSrc).toMatch(/active authorized sourcing staff/i);
  });

  it("hotfix SQL fail-closes is_sourcing_staff to active directory rows", () => {
    const body = functionBody(hotfixSrc);
    expect(body).toMatch(/sourcing_authorized_staff/);
    expect(body).toMatch(/active is true/);
    expect(body).toMatch(/auth\.uid\(\) is not null/);
    expect(body).toMatch(/auth\.jwt\(\)\s*->>\s*['"]email['"]/);
    expect(body).not.toMatch(/auth\.role\(\)/);
  });

  it("base schema matches fail-closed definition", () => {
    const body = functionBody(baseSchemaSrc);
    expect(body).toMatch(/sourcing_authorized_staff/);
    expect(body).toMatch(/active is true/);
    expect(body).not.toMatch(/auth\.role\(\)/);
  });
});
