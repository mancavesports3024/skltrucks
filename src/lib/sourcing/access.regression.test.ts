import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import path from "node:path";

/**
 * Permanent guard: sourcing must stay aligned with inventory admin login.
 * PR #23 briefly required sourcing_authorized_staff for every /admin/sourcing
 * route and locked signed-in admins behind a misleading banner. Do not restore that.
 */
describe("sourcing access regression guards", () => {
  it("requireSourcingStaff must not query sourcing_authorized_staff", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/lib/sourcing/access.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/from\(\s*["']sourcing_authorized_staff["']\s*\)/);
    expect(src).toMatch(/Same bar as inventory/i);
  });
});
