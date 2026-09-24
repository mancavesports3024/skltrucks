# Sourcing search discovery benchmark

Read-only **discovery hardening** for comparing Tavily basic search against the existing OpenAI web-search provider. This phase does **not** merge, deploy, enable cron/email, change production data, or import leads.

Related staff pilot docs: [`sourcing-internet-search-pilot.md`](./sourcing-internet-search-pilot.md).

## Why discovery and inspection are separate

Search result snippets often omit GVWR, mileage, engine, or transmission even when the individual listing page has them. Packing every buying-profile field into discovery queries (as the current broad OpenAI/Tavily plans do) over-constrains the web search and returns few usable individual listing URLs.

| Stage | Job | Fields |
|---|---|---|
| **Discovery** | Find plausible unit URLs | Make/model, box length, Cummins/automatic phrasing, light regional hints, optional known domains |
| **Inspection / classification** | Verify requirements from page evidence | GVWR ≤ 26,000 (reject ≥ 26,001), mileage, age, distance from Joplin, U.S.-only, liftgate preference |

Do **not** call a truck “Confirmed” from a search snippet. Confirmation requires individual-page evidence through the existing inspection/classification pipeline.

### Why the current broad OpenAI query yields few usable listings

`buildSearchQueryPlans()` builds a single core string that concatenates engine, transmission, all box lengths (`24 OR 26 OR 28`), GVWR, mileage, and often liftgate. OpenAI discovery then caps retained listing URLs (≈4) and the URL gate rejects hub/`/listings` paths (e.g. TruckPaper). The combination of over-constrained queries + strict individual-URL retention produces few keepable hits.

This benchmark uses a **smaller, relaxed query matrix** (~10–12 queries) so discovery can find URLs; inspection still enforces the full buying profile.

## Architecture (reuse, do not duplicate)

| Concern | Existing code | Benchmark |
|---|---|---|
| Provider resolution | `providers/` (Tavily preferred; OpenAI optional; mock) | Injected search client only |
| Tavily production run | `runTavilySearch` (search **+** selective extract) | **Discovery only** — basic search; extract disabled |
| URL gate | `isIndividualListingUrl`, Penske/TruckPaper rules | `classifyDiscoveryUrl` buckets |
| Canonical / dedupe | `canonicalizeListingUrl` | Same |
| Cost model | `estimateTavilyCostUsd` | Same |
| Match / GVWR / country | `classifyLead` | Tests only; no lead writes |

**Tavily today (production pilot):** discovery **and** selective extract.  
**This benchmark:** discovery **only** (basic search). Extraction/inspection stay out of scope unless separately authorized.

## Default ceilings

| Limit | Value |
|---|---|
| Max queries | 12 |
| Max results per query | 10 |
| Max retained individual/likely listing URLs | 20 |
| Max Tavily credits (basic search) | 12 |
| Estimated max cost | `12 × ~$0.008 ≈ $0.096` |

URL buckets:

1. `individual_listing` — passes `isIndividualListingUrl`
2. `likely_listing_needs_inspection` — unit-shaped path; needs page inspect
3. `hub_or_category` — search/category/hub pages (not retained as listings)
4. `unsupported_or_unsafe` — credentials, tokens, fragments, userinfo, session-shaped params, blocked hosts, TruckPaper `/listings`

## How to run mock mode

Zero network, zero OpenAI, zero DB writes:

```bash
npx tsx scripts/run-discovery-benchmark.mts
# or
npm run discovery-benchmark
```

Vitest coverage lives in `src/lib/sourcing/search/discovery-benchmark/discovery-benchmark.test.ts`.

## How to run a controlled live Tavily benchmark

**Do not run live until an operator explicitly authorizes it.** The CLI always prints preflight first and refuses live calls unless both confirmation flags are present.

### Preflight only (recommended first)

```bash
npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts --mode=live_tavily --preflight
```

Preflight reports (never key values):

- Resolved provider
- Key presence (`present` / `missing`)
- Exact query count
- Maximum Tavily credits
- Whether OpenAI will be called
- Confirmation that DB writes are disabled
- Estimated maximum cost

### Authorized live Tavily (one controlled run)

```bash
npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts \
  --mode=live_tavily \
  --confirm-live \
  --i-authorize-live-provider-calls
```

### Comparable provider report (Tavily + OpenAI)

Requires both `TAVILY_API_KEY` and `OPENAI_API_KEY`. Maximum one controlled run per provider. Still no DB writes.

```bash
npx tsx --env-file=.env.local scripts/run-discovery-benchmark.mts \
  --mode=compare \
  --confirm-live \
  --i-authorize-live-provider-calls
```

## How to interpret results

| Metric | Meaning |
|---|---|
| `totalResultUrls` | Raw hits before dedupe/filter |
| `byBucket.individual_listing` | Exact individual listing URLs |
| `byBucket.likely_listing_needs_inspection` | Plausible unit URLs needing page inspect |
| `byBucket.hub_or_category` | Category/search hubs (not usable leads) |
| `byBucket.unsupported_or_unsafe` | Rejected URLs |
| `retained` | Deduped listing/likely URLs with query provenance |
| `creditsOrToolCalls` / `estimatedCostUsd` | Exact credits (Tavily) and estimate |
| `comparison.*` | Tavily-only / OpenAI-only / overlap / cost per usable listing |

A high hub or unsafe rate means discovery is finding pages we correctly refuse to treat as listings. A high retained individual rate is the signal that Tavily (with the relaxed matrix) may materially improve discovery **before** inspection.

## Why benchmark output is not saved as leads

- Discovery URLs are **candidates**, not confirmed trucks.
- Snippets are insufficient for GVWR, country, mileage, or powertrain evidence.
- This phase is explicitly read-only: no `sourcing_truck_leads` / contact inserts, no cron, no email.
- Saving would risk polluting production data with unverified or hub URLs.

Use the normal staff search pilot (`/admin/sourcing/search`) only when ready to persist through the full inspect → classify → dedupe path.

## Out of scope

- Merge / deploy / production env var changes / schema changes
- Cron or email
- Private/session APIs, cookies, tokens, client IDs
- Claiming match from search snippets
- Tavily extract during this benchmark (basic search only unless a documented reason is added later)
