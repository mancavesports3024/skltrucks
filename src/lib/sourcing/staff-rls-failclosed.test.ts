import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("sourcing RLS Admin-aligned SQL", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/sourcing-rls-admin-aligned.sql"),
    "utf8"
  );

  function functionBody(name: string): string {
    const re = new RegExp(
      `create or replace function public\\.${name}\\(\\)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
      "i"
    );
    const m = sql.match(re);
    if (!m) throw new Error(`function ${name} not found`);
    return m[1];
  }

  it("is_sourcing_staff matches products authenticated Admin bar", () => {
    const body = functionBody("is_sourcing_staff");
    expect(body).toMatch(/auth\.role\(\)\s*=\s*'authenticated'/);
    expect(body).not.toMatch(/sourcing_authorized_staff/);
    expect(body).not.toMatch(/auth\.jwt/);
  });

  it("does not require a separate sourcing directory for authorization", () => {
    expect(sql).toMatch(/Not consulted for authorization/i);
    expect(sql).not.toMatch(/^\s*drop table/im);
    expect(sql).not.toMatch(/delete from public\.sourcing_authorized_staff/i);
  });

  it("keeps anon denied and does not alter public products policies", () => {
    expect(sql).toMatch(/revoke all on public\.%I from anon/i);
    expect(sql).not.toMatch(/on public\.products/i);
    expect(sql).not.toMatch(/site_content/i);
  });
});
