# Tavily Discovery → Inspection Preview

Staff-only manual workflow on `/admin/sourcing/search`. **No cron, no email.** Preview never writes leads; Import is an explicit second action.

Related: [`sourcing-search-discovery-benchmark.md`](./sourcing-search-discovery-benchmark.md) (PR #33 benchmark evidence).

## Relationship to PR #33

| Piece | Location | Recommendation |
|---|---|---|
| Unit-oriented query matrix | `src/lib/sourcing/search/discovery/query-matrix.ts` | **Reuse / merge** into production (shared) |
| Positive-evidence URL classifier + noise hosts | `discovery/url-classify.ts` | **Reuse / merge** |
| Server ceilings + cost helpers | `discovery/ceilings.ts` | **Reuse / merge** |
| Benchmark CLI, fixtures, success-threshold, docs for live runs | `discovery-benchmark/` | **Keep separate** — do not ship fixtures into runtime bundles |
| This Preview → Import workflow | `discovery-inspect/` + admin UI | **This PR** |

**Merge order:** Prefer merging PR #33 (benchmark) first for history, then this PR (or merge this PR alone — it already includes the shared `discovery/` extraction). Do not carry CLI/fixtures into production entrypoints; admin imports `@/lib/sourcing/search/discovery` and `discovery-inspect` only.

## Ceilings (server-authoritative)

| Limit | Value |
|---|---|
| Tavily queries / credits | 12 |
| Results per query | 10 |
| Retained discovery URLs | 20 |
| Validated candidates inspected | 10 |
| OpenAI exact-URL inspect calls | 10 max (0 if OpenAI unset) |
| Tavily extract | **never** in this workflow |
| OpenAI discovery | **never** |
| Est. worst-case Tavily | ~$0.096 |
| Est. worst-case OpenAI inspect | ~$0.10–0.15 depending on tokens |
| Combined worst-case | shown in UI before confirm |

## Flow

1. **Discovery** — Tavily basic search with unit-oriented matrix; classify individual / likely / hub / unsafe; retain ≤20.
2. **Validate** — HTTPS, SSRF-safe fetch, bounded redirects, reject category redirects / PDF / bot / 403-as-unverified.
3. **Inspect** — deterministic HTML/JSON-LD extract first; OpenAI exact-URL inspect only when required evidence missing (URL binding enforced).
4. **Classify** — existing `classifyLead` rules (U.S., Cummins, auto, box, GVWR ≤26000 / ≥26001 reject, mileage, age, distance, liftgate preferred).
5. **Preview** — read-only report; `dbWrites: false`.
6. **Import selected** — staff selects rows; server re-checks eligibility; reuses VIN / listing-id / canonical dedupe; never imports hubs/rejected/unverified.

## Production enablement sequence

1. Merge shared discovery + this Preview PR (draft).
2. Confirm `TAVILY_API_KEY` (and optional `OPENAI_API_KEY` for inspect only) already present — **no new env vars required**.
3. Staff opens `/admin/sourcing/search`, runs **mock Preview**, then one confirmed live Preview.
4. Import only after reviewing Confirmed / Needs verification rows.
5. Do not enable cron/email.

## Migration

**None.** Existing `sourcing_search_runs` / lead tables suffice; Preview is ephemeral client/server payload until Import calls the existing persist path.
