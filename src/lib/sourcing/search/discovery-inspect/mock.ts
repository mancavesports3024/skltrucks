/**
 * Deterministic mock discovery + HTML for Preview tests (zero network).
 */
import type { DiscoverySearchClient } from "@/lib/sourcing/search/discovery/types";
import type { SafeFetchResult } from "@/lib/sourcing/search/discovery-inspect/fetch-page";

export function createMockDiscoveryInspectSearchClient(): DiscoverySearchClient {
  return {
    async search(query, options) {
      const max = options?.maxResults ?? 10;
      const q = query.toLowerCase();
      const hits: Array<{ url: string; title: string }> = [];

      if (q.includes("freightliner") || q.includes("vin") || q.includes("stock")) {
        hits.push({
          url: "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001",
          title: "2019 Freightliner M2 106",
        });
        hits.push({
          url: "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-217623",
          title: "2023 Freightliner M2 unit",
        });
      }
      if (q.includes("international")) {
        hits.push({
          url: "https://www.truckandvanoutlet.com/for-sale/2023-international-mv607-26-box-truck-cummins-14496496",
          title: "2023 International MV607",
        });
      }
      // Noise / hubs that must not fill retention as individual
      hits.push({
        url: "https://www.justanswer.com/medium-and-heavy-truck/example.html",
        title: "Q&A",
      });
      hits.push({
        url: "https://www.auctiontime.com/listings/auction-results/freightliner/box-trucks/16004",
        title: "Auction results",
      });
      hits.push({
        url: "https://www.freightlinerfl.com/delivery-moving-straight-box-trucks-for-sale-i2c44f0m0",
        title: "DealerCenter category",
      });
      hits.push({
        url: "https://evil.example/listing?session=abc&token=x",
        title: "unsafe",
      });

      return { results: hits.slice(0, max), creditsCharged: 1 };
    },
  };
}

/** Mock HTML bodies keyed by canonical path fragment. */
export function mockHtmlForUrl(url: string): SafeFetchResult {
  if (/justanswer|auction-results|for-sale-i2c44|session=/i.test(url)) {
    return { ok: false, reason: "should not validate hub/unsafe", finalUrl: url };
  }
  if (/unit-92601996/i.test(url)) {
    return {
      ok: true,
      finalUrl:
        "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/",
      status: 200,
      contentType: "text/html",
      bodyText: "<title>Used Medium Duty Box Trucks for Sale</title>",
      redirectCount: 1,
    };
  }
  if (/\.pdf($|\?)/i.test(url)) {
    return {
      ok: false,
      reason: "non-HTML content-type: application/pdf",
      status: 200,
      finalUrl: url,
      contentType: "application/pdf",
    };
  }
  if (/403-blocked/i.test(url)) {
    return { ok: false, reason: "HTTP 403", status: 403, finalUrl: url };
  }
  if (/bot-challenge/i.test(url)) {
    return {
      ok: true,
      finalUrl: url,
      status: 200,
      contentType: "text/html",
      bodyText: "<title>Checking your browser</title><p>cloudflare captcha</p>",
      redirectCount: 0,
    };
  }

  const vin =
    /unit-217623/i.test(url)
      ? "3ALACWFC7PDUH8210"
      : /14496496/i.test(url)
        ? "3HAEUMML7ML657596"
        : "1HTEUMML5LH842637";
  const year = /2019|2023|2021/.test(url) ? "2019" : "2020";
  const html = `<!doctype html><html><head><title>${year} Cummins Allison Box Truck</title>
<script type="application/ld+json">{"@type":"Vehicle","name":"Freightliner M2","vehicleIdentificationNumber":"${vin}","mileageFromOdometer":{"value":120000}}</script>
</head><body>
<p>Stock # 9001</p>
<p>Cummins ISB 6.7</p>
<p>Allison automatic transmission</p>
<p>26 foot box</p>
<p>GVWR 26,000 lbs</p>
<p>Liftgate</p>
<p>Joplin, MO</p>
<p>Asking price $45,000</p>
<p>Call (417) 555-0100</p>
<p>VIN ${vin}</p>
</body></html>`;

  return {
    ok: true,
    finalUrl: url,
    status: 200,
    contentType: "text/html; charset=utf-8",
    bodyText: html,
    redirectCount: 0,
  };
}

/**
 * Fetch impl for mock Preview: maps known unit URLs to HTML; hubs fail.
 */
export function createMockValidateFetchImpl(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (/unit-92601996/i.test(url)) {
      return new Response(null, {
        status: 302,
        headers: {
          location:
            "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/",
        },
      });
    }
    if (/medium-duty-box-trucks\/?$/i.test(url)) {
      return new Response("<title>Used Medium Duty Box Trucks for Sale</title>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (/127\.0\.0\.1|localhost/i.test(url)) {
      return new Response(null, { status: 500 });
    }
    if (/403-blocked/i.test(url)) {
      return new Response(null, { status: 403 });
    }
    if (/bot-challenge/i.test(url)) {
      return new Response("<title>Checking your browser</title><p>cloudflare captcha</p>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (/\.pdf($|\?)/i.test(url)) {
      return new Response("%PDF", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      });
    }

    const result = mockHtmlForUrl(url);
    if (!result.ok) {
      return new Response(null, { status: result.status || 400 });
    }
    return new Response(result.bodyText, {
      status: 200,
      headers: { "content-type": result.contentType || "text/html" },
    });
  }) as typeof fetch;
}
