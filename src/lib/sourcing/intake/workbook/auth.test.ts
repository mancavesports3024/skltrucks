import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/sourcing/access", () => ({
  requireSourcingStaff: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));

import { requireSourcingStaff } from "@/lib/sourcing/access";
import { previewWorkbookIntake, applyWorkbookIntake } from "@/lib/sourcing/db";

describe("workbook intake authorization", () => {
  beforeEach(() => {
    vi.mocked(requireSourcingStaff).mockReset();
  });

  it("rejects preview when caller is not sourcing staff", async () => {
    vi.mocked(requireSourcingStaff).mockResolvedValue({
      ok: false,
      error: "Unauthorized",
    } as Awaited<ReturnType<typeof requireSourcingStaff>>);
    const result = await previewWorkbookIntake(Buffer.from("x"), "x.xls");
    expect(result.error).toMatch(/Unauthorized/i);
    expect(result.report).toBeUndefined();
  });

  it("rejects import when caller is not sourcing staff", async () => {
    vi.mocked(requireSourcingStaff).mockResolvedValue({
      ok: false,
      error: "Unauthorized",
    } as Awaited<ReturnType<typeof requireSourcingStaff>>);
    const result = await applyWorkbookIntake(Buffer.from("x"), "x.xls");
    expect(result.error).toMatch(/Unauthorized/i);
    expect(result.report).toBeUndefined();
  });
});
