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
  it("does not declare use client or browser event handlers", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/admin/sourcing/TruckLeadsList.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/['"]use client['"]/);
    expect(src).not.toMatch(/\bonClick\b/);
    expect(src).not.toMatch(/\bonMouse[A-Z]\w*\b/);
    expect(src).not.toMatch(/\bonKey[A-Z]\w*\b/);
    expect(src).not.toMatch(/\bonPointer[A-Z]\w*\b/);
    // Listing/inspection must stay plain anchors with safe blank-target attrs.
    expect(src).toMatch(/target="_blank"/);
    expect(src).toMatch(/rel="noopener noreferrer"/);
  });

  it("renders listing and inspection as sibling anchors outside the title Link", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/admin/sourcing/TruckLeadsList.tsx"),
      "utf8"
    );
    // Title Link closes before LeadSubmeta; external anchors are not nested in it.
    expect(src).toMatch(
      /<\/Link>\s*<p className="mt-1[\s\S]*?<LeadSubmeta|\<\/Link>\s*<LeadSubmeta/
    );
  });
});
