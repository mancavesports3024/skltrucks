import { describe, expect, it } from "vitest";
import { formatLeadMileage, formatLeadYear } from "@/lib/sourcing/format-lead-display";

describe("formatLeadYear / formatLeadMileage", () => {
  it("formats year and mileage for display", () => {
    expect(formatLeadYear(2019)).toBe("2019");
    expect(formatLeadMileage(136242)).toBe("136,242 mi");
  });

  it("shows em dash when year or mileage is missing", () => {
    expect(formatLeadYear(null)).toBe("—");
    expect(formatLeadYear(undefined)).toBe("—");
    expect(formatLeadMileage(null)).toBe("—");
    expect(formatLeadMileage(undefined)).toBe("—");
  });
});
