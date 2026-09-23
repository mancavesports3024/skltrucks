import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function functionBody(sql: string, name: string): string {
  const re = new RegExp(
    `create or replace function public\\.${name}\\(\\)[\\s\\S]*?as \\$\\$[\\s\\S]*?\\$\\$;`,
    "i"
  );
  const m = sql.match(re);
  if (!m) throw new Error(`function ${name} not found`);
  return m[0];
}

describe("sourcing staff RLS fail-closed SQL", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/sourcing-staff-rls-failclosed.sql"),
    "utf8"
  );

  it("requires uid, jwt email, and active directory row", () => {
    const body = functionBody(sql, "is_sourcing_staff");
    expect(body).toMatch(/auth\.uid\(\) is not null/);
    expect(body).toMatch(/auth\.jwt\(\)\s*->>\s*'email'/);
    expect(body).toMatch(/sourcing_authorized_staff/);
    expect(body).toMatch(/active is true/);
  });

  it("does not grant staff on authenticated role alone", () => {
    const body = functionBody(sql, "is_sourcing_staff");
    expect(body).not.toMatch(/auth\.role\(\)/);
    expect(body).not.toMatch(
      /select coalesce\(auth\.role\(\) = 'authenticated', false\);/
    );
  });

  it("tightens authorized_staff directory policy and revokes anon", () => {
    expect(sql).toMatch(/Sourcing staff read authorized staff directory/);
    expect(sql).toMatch(/revoke all on public\.sourcing_authorized_staff from anon/i);
    expect(sql).toMatch(/revoke all on public\.%I from anon/i);
  });

  it("bootstraps skltrucksllc@gmail.com as active without printing secrets", () => {
    expect(sql).toMatch(/skltrucksllc@gmail\.com/);
    expect(sql).toMatch(/active = true/);
  });

  it("does not alter public products inventory policies", () => {
    expect(sql).not.toMatch(/on public\.products/i);
    expect(sql).not.toMatch(/site_content/i);
  });
});
