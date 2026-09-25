# Tavily Discovery → Inspection Preview

Staff-only manual workflow on `/admin/sourcing/search`. **No cron, no email.** Preview never writes leads; Import is an explicit second action that **revalidates selected URLs server-side**.

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
| Import selected URLs | ≤10 |
| OpenAI exact-URL inspect calls | 10 max (0 if OpenAI unset) |
| Validation concurrency | 3 |
| Preview overall deadline | 90s (starts before first Tavily call; wraps every provider/fetch) |
| Import overall deadline | 60s (absolute `deadlineAt` set before DB reads/lock; governs pre-write prep only) |
| Per-URL fetch overall deadline | 20s (also capped by remaining Preview/Import budget) |
| Response body max | 1.5 MB (Content-Length + stream abort) |
| Tavily extract | **never** in this workflow |
| OpenAI discovery | **never** |
| OpenAI / Tavily during Import | **never** |

## SSRF (connection-pinned)

Production fetch uses `node:https` with a custom `lookup` that returns only pre-validated public addresses (TLS SNI + Host preserved). DNS that yields any private/loopback/link-local/CGNAT/mapped-IPv6 address is rejected. Every redirect re-resolves and re-validates. No cookies or Authorization headers.

## Import trust model

Client sends **selected listing URLs only**. Server re-classifies, SSRF-fetches, deterministically extracts, maps, classifies, and dedupes. Client truck/evidence/`importEligible` fields are ignored (not accepted). Preferred over signed Preview tokens — no migration or new secret.

## Flow

1. **Discovery** — Tavily basic search; classify; retain ≤20.
2. **Validate** — HTTPS, connection-pinned SSRF fetch, streaming size cap, bounded concurrency + overall deadline.
3. **Inspect** — deterministic HTML/JSON-LD; OpenAI inspect only for missing evidence; **URL mismatch discards the entire OpenAI result**.
4. **Classify** — existing `classifyLead` rules.
5. **Preview** — read-only; `dbWrites: false`; `usage.live` reflects Preview mode; end-to-end `deadlineAt` from before first Tavily call; partial results when time expires.
6. **Import** — selected URLs only; full revalidation under one Import `deadlineAt` created before DB/lock; **pre-write deadline check** — if expired, partial/skipped report with **zero writes**. Persistence is never `Promise.race`'d; once started it completes. Tavily SDK has no AbortSignal — timed-out searches are counted as attempted credits (`provider request timed out; charge may still occur`).

Lock release uses `finally` when the runtime allows; if the platform terminates the isolate, **stale-lock takeover** remains the backstop.

## Production enablement sequence

1. Merge shared discovery + this Preview PR (draft).
2. Confirm `TAVILY_API_KEY` (and optional `OPENAI_API_KEY` for inspect only) — **no new env vars**.
3. Staff: mock Preview → confirmed live Preview → Import selected.
4. Do not enable cron/email.

## Migration

**None.**
