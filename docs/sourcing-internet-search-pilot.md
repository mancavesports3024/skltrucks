# Internet Search Pilot (nonprod)

Staff-only “Run search now” at `/admin/sourcing/search`. **Not scheduled.** Results write into private truck leads and supplier contacts.

## Credentials required (server-only)

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | For live runs | OpenAI Responses API + hosted `web_search` tool |
| `OPENAI_SEARCH_MODEL` | Optional | Default `gpt-4o-mini` |
| `OPENAI_SEARCH_MAX_TOOL_CALLS` | Optional | Default `6` |

Never put these in `NEXT_PUBLIC_*` or client code. Without `OPENAI_API_KEY`, the UI still offers **Run mock search** (deterministic fixtures).

## Existing providers in this repository

- **OpenAI** — newly wired for this pilot (`openai` npm package + Responses `web_search`).
- **No** Brave / SerpAPI / Tavily / Bing search keys were already configured.
- **Nodemailer / Gmail** exist for site forms only — **not** used by search (no email on this pilot).
- **Supabase** — stores buying profile, leads, contacts, and `sourcing_search_runs` reports.

## Estimated API cost per search run

Using OpenAI published list rates (subject to change):

- Hosted **web_search**: about **$0.01 per search call** ($10 / 1,000).
- Model tokens (`gpt-4o-mini`): about **$0.15 / 1M input**, **$0.60 / 1M output**.

With default max 6 tool calls and a few thousand tokens, expect roughly **$0.04–$0.08 USD per live run** (often closer to **~$0.05**). The run report records `webSearchCalls`, token counts, and `estimatedCostUsd`.

## Schema

Re-apply `supabase/sourcing-schema.sql` so `sourcing_search_runs` exists (idempotent). Do **not** treat this as a production migration / deploy step for the pilot itself.

## Success criteria

A successful run saves **individual listing URLs** plus a **usable published seller/supplier phone** — not category/search-result links.
