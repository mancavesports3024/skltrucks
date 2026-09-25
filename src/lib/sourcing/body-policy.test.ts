/**
 * Dry-box / refrigerated-body exclusion regressions.
 */
import { describe, expect, it, vi } from "vitest";
import {
  REFRIGERATED_BODY_OUTSIDE_PROFILE,
  classifyBodyKind,
  hasPositiveRefrigeratedBodyEvidence,
} from "@/lib/sourcing/body-policy";
import { classifyLead, type LeadMatchInput } from "@/lib/sourcing/match";
import {
  classifySafeFetchFailureReason,
} from "@/lib/sourcing/search/discovery-inspect/fetch-page";
import { revalidateSelectedUrlsForImport } from "@/lib/sourcing/search/discovery-inspect/import-selected";
import { runDiscoveryInspectPreview } from "@/lib/sourcing/search/discovery-inspect/preview";
import { staffValidationFailureReason } from "@/lib/sourcing/search/discovery-inspect/validate-url";
import { extractTruckFromPageText } from "@/lib/sourcing/search/extract-from-text";
import type { DiscoverySearchClient } from "@/lib/sourcing/search/discovery/types";
import { DEFAULT_BUYING_PROFILE } from "@/types/sourcing";

const REEFER_URL =
  "https://www.truckandvanoutlet.com/for-sale/2019-international-mv-607-refrigerated-truck-26-insulated-body-tuck-away-lift-non-cdl-cummins-power-14590373";

const REEFER_TITLE =
  "2019 International MV 607 REFRIGERATED TRUCK 26' INSULATED BODY Tuck Away Lift Non-CDL Cummins Power";

const REEFER_HTML = `<!doctype html><html><head><title>${REEFER_TITLE}</title>
<script type="application/ld+json">{"@type":"Vehicle","name":"International MV 607 Refrigerated Truck","vehicleIdentificationNumber":"3HAEUMMLXKL123456","mileageFromOdometer":{"value":180000}}</script>
</head><body>
<p>Stock # 14590373</p>
<p>${REEFER_TITLE}</p>
<p>Cummins ISB</p>
<p>Automatic transmission</p>
<p>26' insulated refrigerated body</p>
<p>Refrigeration unit</p>
<p>GVWR 26,000 lbs</p>
<p>Tuck-away liftgate</p>
<p>Asking price $39,900</p>
<p>Call (555) 555-0100</p>
<p>VIN 3HAEUMMLXKL123456</p>
</body></html>`;

const DRY_SIGNATURE =
  "https://www.signaturetruckcenter.com/inventory/used-2020-freightliner-m2-28ft-box-truck-3alacwfc7ldlt8351-in-crystal-lake-il";

const DRY_HTML = `<!doctype html><html><head>
<title>Used 2020 Freightliner M2 28ft Box Truck | VIN: 3ALACWFC7LDLT8351</title>
</head><body>
<p>Stock # 18534</p>
<p>2020 Freightliner M2 28ft Box Truck</p>
<p>Cummins B6</p>
<p>Automatic transmission</p>
<p>28 foot dry box</p>
<p>GVWR 26,000 lbs</p>
<p>Liftgate</p>
<p>Crystal Lake, IL</p>
<p>Asking price $44,900</p>
<p>VIN 3ALACWFC7LDLT8351</p>
</body></html>`;

function baseLead(overrides: Partial<LeadMatchInput> = {}): LeadMatchInput {
  return {
    year: 2019,
    boxLengthFt: 26,
    engineIsCummins: true,
    transmissionIsAutomatic: true,
    listedWeightLbs: 26000,
    listedWeightTerm: "gvwr",
    manufacturerGvwrLbs: 26000,
    gvwrDoorPlateVerified: false,
    mileage: 180000,
    hasLiftgate: true,
    drivingDistanceMiles: 800,
    price: 39900,
    location: "Joplin, MO",
    ...overrides,
  };
}

function searchClient(urls: string[]): DiscoverySearchClient {
  return {
    async search(_q, options) {
      const max = options?.maxResults ?? 10;
      return {
        results: urls.slice(0, max).map((url) => ({ url, title: url })),
        creditsCharged: 1,
      };
    },
  };
}

function fetchImpl(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/14590373|refrigerated-truck/i.test(url)) {
      return new Response(REEFER_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (/3alacwfc7ldlt8351/i.test(url)) {
      return new Response(DRY_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    return new Response("missing", { status: 404 });
  }) as typeof fetch;
}

describe("hasPositiveRefrigeratedBodyEvidence", () => {
  it("detects reefer / refrigerated variants", () => {
    expect(hasPositiveRefrigeratedBodyEvidence("REFRIGERATED TRUCK")).toBe(true);
    expect(hasPositiveRefrigeratedBodyEvidence("26' insulated refrigerated body")).toBe(true);
    expect(hasPositiveRefrigeratedBodyEvidence("refrigeration unit installed")).toBe(true);
    expect(hasPositiveRefrigeratedBodyEvidence("refrigerated van")).toBe(true);
    expect(hasPositiveRefrigeratedBodyEvidence("26ft reefer")).toBe(true);
    expect(classifyBodyKind("26FT REEFER VAN")).toBe("reefer");
  });

  it("avoids false positives for dry box and negated refrigeration", () => {
    expect(hasPositiveRefrigeratedBodyEvidence("26ft dry box")).toBe(false);
    expect(hasPositiveRefrigeratedBodyEvidence("insulated body")).toBe(false);
    expect(hasPositiveRefrigeratedBodyEvidence("not refrigerated")).toBe(false);
    expect(hasPositiveRefrigeratedBodyEvidence("non-refrigerated box")).toBe(false);
    expect(classifyBodyKind("26FT DRY VAN")).toBe("dry_van");
  });
});

describe("Truck and Van Outlet refrigerated listing", () => {
  it("classifyLead rejects with explicit outside-profile reason", () => {
    const result = classifyLead(
      baseLead({
        makeModel: REEFER_TITLE,
        sourceUrl: REEFER_URL,
        boxLengthRaw: "26' INSULATED BODY",
        verificationNotes: "refrigerated truck listing",
      }),
      DEFAULT_BUYING_PROFILE
    );
    expect(result.status).toBe("does_not_match");
    expect(result.reasons.some((r) => r.label === REFRIGERATED_BODY_OUTSIDE_PROFILE)).toBe(
      true
    );
  });

  it("Preview marks does_not_match and not import-eligible; no OpenAI; no DB write", async () => {
    const openAi = vi.fn(async () => {
      throw new Error("OpenAI must not run for this regression");
    });
    const preview = await runDiscoveryInspectPreview({
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      mode: "live",
      confirmPaidProviders: true,
      allowLiveNetwork: false,
      tavilyClient: searchClient([REEFER_URL]),
      validateFetchImpl: fetchImpl(),
      openAiInspectUrl: openAi,
      ceilings: {
        maxQueries: 1,
        maxTavilyCredits: 1,
        maxRetainedListingUrls: 5,
        maxInspectCandidates: 5,
        maxOpenAiInspectCalls: 5,
      },
    });

    expect(preview.dbWrites).toBe(false);
    const row = preview.rows.find((r) => /14590373|refrigerated/i.test(r.finalUrl + r.discoveryUrl));
    expect(row).toBeTruthy();
    expect(row!.previewOutcome).toBe("does_not_match");
    expect(row!.importEligible).toBe(false);
    expect(row!.reasons.some((r) => r === REFRIGERATED_BODY_OUTSIDE_PROFILE)).toBe(true);
    expect(openAi).not.toHaveBeenCalled();
    expect(preview.openAiInspectCalls).toBe(0);
  });

  it("Import revalidation rejects the refrigerated URL with zero provider calls", async () => {
    const result = await revalidateSelectedUrlsForImport({
      selectedUrls: [REEFER_URL],
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      fetchImpl: fetchImpl(),
      deadlineAt: Date.now() + 60_000,
    });
    expect(result.trucks).toHaveLength(0);
    expect(result.tavilyCalls).toBe(0);
    expect(result.openAiCalls).toBe(0);
    expect(
      result.rejected.some((r) =>
        /Refrigerated\/reefer body is outside SKL buying profile/i.test(r.reason)
      )
    ).toBe(true);
  });
});

describe("dry-box fixtures remain eligible", () => {
  it("Signature dry-box VIN page stays import-eligible", async () => {
    const preview = await runDiscoveryInspectPreview({
      profile: DEFAULT_BUYING_PROFILE,
      existingLeads: [],
      mode: "mock",
      confirmPaidProviders: true,
      allowLiveNetwork: false,
      tavilyClient: searchClient([DRY_SIGNATURE]),
      validateFetchImpl: fetchImpl(),
      ceilings: {
        maxQueries: 1,
        maxTavilyCredits: 1,
        maxRetainedListingUrls: 5,
        maxInspectCandidates: 5,
        maxOpenAiInspectCalls: 0,
      },
    });
    const row = preview.rows.find((r) => /3ALACWFC7LDLT8351/i.test(r.finalUrl));
    expect(row?.importEligible).toBe(true);
    expect(row?.previewOutcome).not.toBe("does_not_match");
  });

  it("Rhode Island Needs verification unchanged (distance unknown), power liftgate recognized", () => {
    const extracted = extractTruckFromPageText({
      url: "https://example.com/ri-freightliner",
      title: "2027 Freightliner M2 Box Truck Power Liftgate",
      content:
        "2027 Freightliner M2 26ft dry box. Cummins. Automatic. Power liftgate. GVWR 26000. Warwick, RI.",
      sourceName: "example",
    });
    expect(extracted.hasLiftgate).toBe(true);

    const result = classifyLead(
      baseLead({
        year: 2027,
        location: "Warwick, RI",
        drivingDistanceMiles: null,
        hasLiftgate: extracted.hasLiftgate,
        makeModel: "2027 Freightliner M2 Box Truck",
      }),
      DEFAULT_BUYING_PROFILE
    );
    expect(result.status).toBe("needs_verification");
    expect(result.reasons.find((r) => r.code === "distance")?.outcome).toBe("unknown");
    expect(result.reasons.find((r) => r.code === "liftgate")?.outcome).toBe("preferred_pass");
  });

  it("Pompano Beach truck remains rejected for distance", () => {
    const result = classifyLead(
      baseLead({
        location: "Pompano Beach, FL",
        drivingDistanceMiles: 1400,
        makeModel: "2020 Freightliner M2 dry box",
      }),
      DEFAULT_BUYING_PROFILE
    );
    expect(result.status).toBe("does_not_match");
    expect(result.reasons.find((r) => r.code === "distance")?.outcome).toBe("fail");
  });
});

describe("response too large reporting", () => {
  it("keeps response too large as its own validation-limit reason", () => {
    expect(classifySafeFetchFailureReason("response too large")).toBe("response too large");
    expect(
      staffValidationFailureReason({
        ok: false,
        reason: "response too large",
      }).reason
    ).toBe("response too large");
    expect(
      staffValidationFailureReason({
        ok: false,
        reason: "response too large",
      }).outcome
    ).toBe("rejected");
  });
});
