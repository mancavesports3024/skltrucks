import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";
import { createMemorySearchLockStore } from "@/lib/sourcing/search/search-lock";
import { runMockPenskeUrlInspection } from "@/lib/sourcing/search/penske-url-inspection/mock";
import {
  executePenskeUrlInspection,
  PENSKE_URL_INSPECTION_DISABLED_MESSAGE,
} from "@/lib/sourcing/search/penske-url-inspection/run";
import { candidateToTruckLeadInput } from "@/lib/sourcing/search/map-candidates";
import { classifyLead } from "@/lib/sourcing/match";
import { findExistingLead, planIntakeRow } from "@/lib/sourcing/intake/import";

const UNIT =
  "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-228474";

vi.mock("@/lib/sourcing/db", () => ({
  getBuyingProfile: vi.fn(async () => DEFAULT_BUYING_PROFILE),
  getTruckLeads: vi.fn(async () => []),
  getSupplierContacts: vi.fn(async () => []),
  upsertSupplierContact: vi.fn(async () => ({
    contact: {
      id: "c1",
      company: "Penske Used Trucks",
      phone: "1-866-309-1962",
      contactName: "",
      role: "",
      email: "",
      sourceUrl: UNIT,
      supplierType: "",
      dealerWholesaleStatus: "",
      lastContactDate: null,
      nextFollowUpDate: null,
      callNotes: "",
      drivingDistanceMiles: null,
      phoneVerified: false,
      researchNotes: "",
    },
  })),
}));

describe("executePenskeUrlInspection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("denies execution when feature flag missing/false", async () => {
    vi.stubEnv("SOURCING_PENSKE_URL_INSPECTION_ENABLED", "");
    const result = await executePenskeUrlInspection({
      urlsText: UNIT,
      accessOverride: {
        ok: true,
        user: { id: "u1", email: "staff@skl.com" } as never,
        supabase: {} as never,
      },
    });
    expect(result.error).toBe(PENSKE_URL_INSPECTION_DISABLED_MESSAGE);
    expect(result.report).toBeUndefined();
  });

  it("denies unauthorized staff", async () => {
    vi.stubEnv("SOURCING_PENSKE_URL_INSPECTION_ENABLED", "true");
    const result = await executePenskeUrlInspection({
      urlsText: UNIT,
      accessOverride: { ok: false, error: "Unauthorized", status: 401 },
    });
    expect(result.error).toBe("Unauthorized");
  });

  it("runs inspect-only mock under lock with zero network", async () => {
    vi.stubEnv("SOURCING_PENSKE_URL_INSPECTION_ENABLED", "true");
    const lock = createMemorySearchLockStore();
    let providerCalls = 0;

    const supabase = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: "lead-1" }, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
        select: () => ({
          ilike: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };

    const result = await executePenskeUrlInspection({
      urlsText: UNIT,
      forceMock: true,
      lockStore: lock,
      accessOverride: {
        ok: true,
        user: { id: "u1", email: "staff@skl.com" } as never,
        supabase: supabase as never,
      },
      runInspect: async (profile, urls) => {
        providerCalls += 1;
        expect(urls).toEqual([
          "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-228474",
        ]);
        return runMockPenskeUrlInspection(profile, urls);
      },
    });

    expect(providerCalls).toBe(1);
    expect(result.error).toBeUndefined();
    expect(result.report?.apiUsage.provider).toBe("mock");
    expect(result.report?.apiUsage.live).toBe(false);
    expect(result.report?.trucksSaved.length).toBeGreaterThan(0);
    // Lock released — another acquire succeeds
    expect((await lock.tryAcquire("other@skl.com")).ok).toBe(true);
  });

  it("rejects invalid URL batches before acquiring lock / calling provider", async () => {
    vi.stubEnv("SOURCING_PENSKE_URL_INSPECTION_ENABLED", "true");
    const lock = createMemorySearchLockStore();
    let providerCalls = 0;
    const result = await executePenskeUrlInspection({
      urlsText: "https://evil.example/unit-1/",
      lockStore: lock,
      accessOverride: {
        ok: true,
        user: { id: "u1", email: "staff@skl.com" } as never,
        supabase: {} as never,
      },
      runInspect: async () => {
        providerCalls += 1;
        throw new Error("should not run");
      },
    });
    expect(providerCalls).toBe(0);
    expect(result.error).toMatch(/penskeusedtrucks\.com/i);
  });
});

describe("existing classification + dedupe on mock Penske trucks", () => {
  it("maps mock inspect trucks through classify and dedupe helpers", () => {
    const search = runMockPenskeUrlInspection(DEFAULT_BUYING_PROFILE, [UNIT]);
    const mapped = candidateToTruckLeadInput(search.payload.trucks[0]);
    expect(mapped.rejectReason).toBeUndefined();
    expect(mapped.input?.sourceUrl).toBe(UNIT);

    const match = classifyLead(mapped.input!, DEFAULT_BUYING_PROFILE);
    expect(["confirmed_match", "needs_verification", "does_not_match", "out_of_range_opportunity"]).toContain(
      match.status
    );

    const plan1 = planIntakeRow(mapped.input!, undefined, DEFAULT_BUYING_PROFILE, {
      dateObserved: "2026-09-20",
      missingEvidence: [],
    });
    expect(plan1.kind).toBe("inserted");

    const existing = {
      id: "e1",
      ...plan1.input,
      matchStatus: plan1.matchStatus,
      matchReasons: [],
      listingFirstSeenAt: plan1.listingFirstSeenAt,
      listingLastChangedAt: plan1.listingLastChangedAt,
      listingLastSeenAt: plan1.listingLastSeenAt,
    };
    const found = findExistingLead([existing], mapped.input!);
    expect(found?.id).toBe("e1");
  });
});
