# Penske unit URL inspection (staff Phase A)

Staff-operated **inspect-only** workflow for up to **10** public Penske individual unit URLs. Disabled by default.

## Status

| Item | Status |
| --- | --- |
| Feature flag | `SOURCING_PENSKE_URL_INSPECTION_ENABLED` — **fail-closed** (missing/false → off) |
| Production enablement | **Requires written Penske authorization** before setting the flag to `true` |
| Bulk inventory | **Excel/CSV intake** remains the approved bulk workflow (`/admin/sourcing/intake`) |
| SPA / API credentials | **Not used** — no cookie replay, no `x-ibm-client-id`, no session paste |

## What staff do

1. Filter and open individual unit pages on Penske’s **public** site in their own browser.
2. Paste **1–10** unit URLs (paths containing `/unit-{digits}/`) into **Inspect Penske listings** on `/admin/sourcing/search` (only visible when the flag is on).
3. Confirm the estimated maximum cost, then click **Run Penske inspection**.

Category hubs, `search-inventory.html`, fragments, userinfo, and session-shaped query params are rejected. One invalid URL rejects the entire request.

## Server behavior

- `requireSourcingStaff()` (env allowlist when set **and** `is_sourcing_staff` RPC)
- Existing search **single-flight lock** before any provider call; always released
- **Inspect-only** OpenAI path — no discovery / profile-wide web search
- Submitted `listingUrl` must match model output exactly (no URL rewrite)
- Existing evidence gate, classify, deterministic rejects, seller link, lead dedupe
- Partial inspect failure does not cancel other URLs
- Usage / cost reporting preserved

## Env

| Variable | Default | Notes |
| --- | --- | --- |
| `SOURCING_PENSKE_URL_INSPECTION_ENABLED` | unset → **off** | Set `true` or `1` only after written Penske OK |
| `SOURCING_PENSKE_URL_INSPECTION_MAX_TOOL_CALLS` | `10` | Cap on web_search calls for this mode (≤10) |
| `OPENAI_API_KEY` | — | Required for live inspect; otherwise mock |

## Cost (order of magnitude)

Estimated maximum shown in UI ≈ **one `$0.01` web_search call per URL** plus a token ceiling. For 10 URLs the confirmation estimate is typically **under ~$0.25**. Actual usage is reported on the run.
