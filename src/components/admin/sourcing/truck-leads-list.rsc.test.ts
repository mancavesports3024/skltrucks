import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Regression: TruckLeadsList is a Server Component. Passing onClick on <a>
 * caused production digest 513173951:
 * "Event handlers cannot be passed to Client Component props."
 * and 500s on /admin/sourcing/leads when any lead has a listing or inspection URL.
 */
describe("TruckLeadsList RSC safety", () => {
  it("does not declare use client or onClick handlers", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/admin/sourcing/TruckLeadsList.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/['"]use client['"]/);
    expect(src).not.toMatch(/\bonClick\b/);
  });
});
