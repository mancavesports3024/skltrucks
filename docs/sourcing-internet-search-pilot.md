# Internet Search Pilot (nonprod)

Staff-only “Run search now” at `/admin/sourcing/search`. **Not scheduled.** Results write into private truck leads and supplier contacts.

## Provider abstraction

| Provider | When used | Notes |
|---|---|---|
| **Tavily** (preferred live) | `TAVILY_API_KEY` set | Basic search + selective basic extract |
| **OpenAI** (optional) | Tavily unset and `OPENAI_API_KEY` set, or `SOURCING_SEARCH_PROVIDER=openai` | Responses API `web_search` |
| **Mock** | No live keys, or **Run mock search** / tests | Deterministic fixtures |

Code entry: `src/lib/sourcing/search/providers/` — `runInternetSearch()` resolves the provider. Persist / classify / dedupe / reporting in `run.ts` are provider-agnostic.

## Credentials required (server-only)

| Variable | Required | Purpose |
|---|---|---|
| **`TAVILY_API_KEY`** | For the initial live pilot | Tavily Search + Extract |
| `OPENAI_API_KEY` | Optional later | OpenAI Responses + `web_search` |
| `OPENAI_SEARCH_MODEL` | Optional | Default `gpt-4o-mini` |
| `OPENAI_SEARCH_MAX_TOOL_CALLS` | Optional | Default `6` |
| `SOURCING_SEARCH_PROVIDER` | Optional | Force `tavily` \| `openai` \| `mock` when that provider is configured |

Never put these in `NEXT_PUBLIC_*`, client components, logs, test output, or error messages.

## Tavily credit budget (per staff run)

Hard-capped at **20 credits**:

- Basic search = **1 credit** each (max 10 searches)
- Basic extract = **1 credit per 5 successful URLs** (max 25 URLs → ≤5 credits)
- Typical run ≈ **10–15 credits**

The search-run report shows **provider** and **credits consumed**.

## Schema

Re-apply `supabase/sourcing-schema.sql` so `sourcing_search_runs` exists (idempotent). Do **not** treat that as a production migration / deploy step for the pilot itself.

## Success criteria

A successful run saves **individual listing URLs** plus a **usable published seller/supplier phone** — not category/search-result links. Missing required evidence → **Needs verification**. Never invent contacts, phones, VINs, prices, or specs.
