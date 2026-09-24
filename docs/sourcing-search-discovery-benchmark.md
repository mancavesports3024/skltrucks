# Sourcing search discovery benchmark

Read-only **discovery hardening** for comparing Tavily basic search against the existing OpenAI web-search provider. This phase does **not** merge, deploy, enable cron/email, change production data, or import leads.

Related staff pilot docs: [`sourcing-internet-search-pilot.md`](./sourcing-internet-search-pilot.md).

## Live run 1 — failed usable-listing benchmark (do not treat as success)

Authorized Tavily-only run on draft PR #33 @ `744e10e` (2026-09-24):

| Metric | Value |
|---|---|
| Queries executed | **12** |
| Credits / estimated cost | **12 / ~$0.096** |
| Raw result URLs | **120** |
| Raw hits bucketed `individual_listing` | **51** (incorrect — almost all hubs) |
| Likely listing | **1** |
| Hub/category | **63** |
| Unsafe | **5** |
| Retained (cap 20) | **20** |
| Manually verified true unit VDPs among retained | **effectively 0** |
| OpenAI calls | **0** |
| Tavily extract | **0** |
| DB writes | **0** |

**Verdict:** Failed usable-listing benchmark. Volume was cheap, but the retention set was dominated by DealerCenter category SEO, SOARR filters, eBay browse/shop, TractorHouse `/listings`, and make/model inventory indexes. This is **not** a material discovery improvement.

Follow-up hardening (this document revision): positive-evidence `individual_listing` rules, unit-oriented query matrix, accurate unique-URL metrics, full retained provenance in the CLI, and a documented second-run success threshold.

## Why discovery and inspection are separate

Search result snippets often omit GVWR, mileage, engine, or transmission even when the individual listing page has them. Packing every buying-profile field into discovery queries over-constrains the web search and returns few usable individual listing URLs.

| Stage | Job | Fields |
|---|---|---|
| **Discovery** | Find plausible **unit** URLs | Make/model + VIN/Stock/unit phrasing, light year range, optional known dealer domains |
| **Inspection / classification** | Verify requirements from page evidence | GVWR ≤ 26,000 (reject ≥ 26,001), mileage, age, distance from Joplin, U.S.-only, liftgate preference |

Do **not** call a truck “Confirmed” from a search snippet. Confirmation requires individual-page evidence through the existing inspection/classification pipeline.

### Why the current broad OpenAI query yields few usable listings

`buildSearchQueryPlans()` builds a single core string that concatenates engine, transmission, all box lengths (`24 OR 26 OR 28`), GVWR, mileage, and often liftgate. OpenAI discovery then caps retained listing URLs (≈4) and the URL gate rejects hub/`/listings` paths (e.g. TruckPaper).

### Why live run 1’s “individual_listing” bucket failed

The previous discovery classifier treated a permissive path heuristic (and production `isIndividualListingUrl`) as sufficient for `individual_listing`. That accepted category SEO paths such as `*-for-sale-i2c44f0m0`, SOARR `/box-trucks-for-sale`, eBay `/b/` and `/shop/`, and generic `/box-truck` indexes. Hardening now requires **positive unit-level VDP evidence** for `individual_listing`; uncertain paths become `likely_listing_needs_inspection`.

## Architecture (reuse, do not duplicate)

| Concern | Existing code | Benchmark |
|---|---|---|
| Provider resolution | `providers/` (Tavily preferred; OpenAI optional; mock) | Injected search client only |
| Tavily production run | `runTavilySearch` (search **+** selective extract) | **Discovery only** — basic search; extract disabled |
| URL gate | production `isIndividualListingUrl` (pilot persist) | Stricter `classifyDiscoveryUrl` for benchmark retention |
| Canonical / dedupe | `canonicalizeListingUrl` | Same |
| Cost model | `estimateTavilyCostUsd` | Same |
| Match / GVWR / country | `classifyLead` | Tests only; no lead writes |

**Tavily today (production pilot):** discovery **and** selective extract.  
**This benchmark:** discovery **only** (basic search).

## Default ceilings

| Limit | Value |
|---|---|
| Max queries | 12 |
| Max results per query | 10 |
| Max retained individual/likely listing URLs | 20 |
| Max Tavily credits (basic search) | 12 |
| Estimated max cost | `12 × ~$0.008 ≈ $0.096` |

URL buckets:

1. `individual_listing` — **positive** unit VDP evidence only (host-specific pattern, numeric listing/unit/stock id, VIN leaf, etc.)
2. `likely_listing_needs_inspection` — unit-shaped but unproven; needs page inspect
3. `hub_or_category` — search/category/collection pages (not retained)
4. `unsupported_or_unsafe` — credentials, tokens, fragments, userinfo, session-shaped params, blocked hosts, TruckPaper `/listings`

## Second-run success threshold

Before authorizing another live Tavily run, success requires **all** of:

| Gate | Threshold |
|---|---|
| Manually verified true individual unit pages among retained | ≥ **5** |
| Share of retained that are true unit pages | ≥ **25%** |
| Known category/search URL classified `individual_listing` | **0** |
| Unsafe URL retained | **0** |
| Estimated cost | ≤ **$0.10** |
| OpenAI / Tavily extract / DB writes | **0** |

If the next live run misses this threshold, **stop further Tavily tuning or change providers** — do not repeatedly retune without evidence. Code: `DISCOVERY_BENCHMARK_SUCCESS_THRESHOLD` / `evaluateDiscoveryBenchmarkSuccess`.

## How to run mock mode

Zero network, zero OpenAI, zero DB writes:

```bash
npx tsx scripts/run-discovery-benchmark.mts
# or
npm run discovery-benchmark
```

Vitest coverage: `src/lib/sourcing/search/discovery-benchmark/discovery-benchmark.test.ts`  
First-run fixtures: `first-run-fixtures.ts`

## How to run a controlled live Tavily benchmark

**Do not run live until an operator explicitly authorizes it.** The CLI prints preflight first and refuses live calls unless both confirmation flags are present.

### Preflight only (recommended first)

```bash
npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts --mode=live_tavily --preflight
```

Preflight reports (never key values):

- Resolved provider
- Key presence (`present` / `missing`)
- Exact query count + query texts
- Maximum Tavily credits
- Whether OpenAI will be called
- Confirmation that DB writes are disabled
- Estimated maximum cost
- Success threshold object

### Authorized live Tavily (one controlled run)

```bash
npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts \
  --mode=live_tavily \
  --confirm-live \
  --i-authorize-live-provider-calls
```

## How to interpret results

| Metric | Meaning |
|---|---|
| `metrics.rawResultUrls` | Raw hits before dedupe/filter |
| `metrics.uniqueCanonicalUrlsAllBuckets` | Unique canonicals across **all** buckets (incl. hubs) |
| `metrics.uniqueIndividualUrls` | Unique proven unit VDP URLs |
| `metrics.uniqueLikelyUrls` | Unique ambiguous unit-shaped URLs |
| `metrics.uniqueHubUrls` | Unique category/search hubs |
| `metrics.uniqueUnsafeUrls` | Unique unsafe/rejected |
| `metrics.retainedUrls` | Deduped individual+likely retained (cap applied) |
| `metrics.duplicateRawHits` | Duplicate raw hits of already-retained canonicals |
| `metrics.retentionCapDrops` | Retainable URLs dropped after cap |
| `retained[].provenance` | Full query id + query text + title per retained URL |
| `rejectedUnsafeCount` | Count only — **unsafe raw URLs are not printed** |

A high hub rate after hardening means discovery is correctly refusing category pages. Usable discovery is measured by **manually verified unit VDPs among retained**, not by raw `individual_listing` hit counts.

## Why benchmark output is not saved as leads

- Discovery URLs are **candidates**, not confirmed trucks.
- Snippets are insufficient for GVWR, country, mileage, or powertrain evidence.
- This phase is explicitly read-only: no `sourcing_truck_leads` / contact inserts, no cron, no email.
- Live run 1 showed that “retained” can still be all hubs without positive VDP rules.

Use the normal staff search pilot (`/admin/sourcing/search`) only when ready to persist through the full inspect → classify → dedupe path.

## Out of scope

- Merge / deploy / production env var changes / schema changes
- Cron or email
- Private/session APIs, cookies, tokens, client IDs
- Claiming match from search snippets
- Tavily extract during this benchmark (basic search only)
- Calling live run 2 without explicit operator authorization
