# Box-truck listing intake — recurring sources (nonprod pilot)

SKL needs **repeatable individual listings**, not category search pages. A public inventory search URL is **not** treated as a dependable daily feed (layout changes, login walls, ToS, and incomplete specs).

## Buying profile — GVWR

| Rule | Value |
| --- | --- |
| Maximum manufacturer-rated GVWR | **26,000 lb** |
| Acceptable | **GVWR ≤ 26,000** |
| Rejected | **GVWR ≥ 26,001** |

Missing or non-numeric / ambiguous GVWR → **Needs verification** (not confirmed). Door-plate confirmation remains best practice. A retail listing field labeled only “GVW” (without authorized workbook evidence) is still not treated as confirmed manufacturer GVWR.

Other unchanged requirements: Cummins; automatic; box 24/26/28 ft; mileage ≤ 275,000; age ≤ 9 years; within 1,200 miles of Joplin, Missouri; liftgate preferred; price open.

## 1. Penske Pre-Auction workbook (authorized dealer Excel)

| Channel | Status for SKL |
| --- | --- |
| Public search page | **Not** a permitted automated daily feed |
| Pre-auction `.xls` emailed to licensed dealers | **Permitted** — staff-reviewed upload at `/admin/sourcing/intake` |
| Medium Duty sheet only | Used for this buying profile |

**Pilot path today:** Preview → Import. Format detected by sheet/header signature (not filename). `source_scope = penske-preauction`, `source_listing_id = Unit`. VIN preferred for dedupe. **No public listing URL is invented**; missing URL does not block import when Unit/VIN exists. Workbook GVW is retained as evidence and used for ≤26,000 classification; door-plate still recommended at purchase.

Optional (flagged off): paste ≤10 public `/unit-{id}/` URLs for inspect-only enrichment — see `docs/sourcing-penske-url-inspection.md`. Requires written Penske authorization before enabling.

## 2. Hogan Wholesale workbook

| Channel | Status for SKL |
| --- | --- |
| Wholesale `.xlsx` emailed to dealers | **Permitted** — staff-reviewed upload |
| Public scrape | **Not** permitted here |

**Pilot path today:** Preview → Import. `source_scope = hogan-wholesale`, `source_listing_id = Unit #` (VIN absent from main table). Third-party inspection HTTPS links are stored in `spec_evidence.inspectionUrl` only when the host is allowlisted — **never** used as the vehicle sale/listing URL. Completion labels (Not Started / 75% / 100%) are preserved but **not** treated as proof of availability.

## 3. Penske Used Trucks (fleet / weekly email)

| Channel | Status for SKL |
| --- | --- |
| Weekly inventory email via Penske dealer sales rep | **Permitted** once SKL registers as a dealer/buyer |
| CSV / API download | Ask rep — no public API |

## 4. Ryder (and similar national fleet remarketers)

Account manager / wholesale email lists → staff CSV when a stable sheet arrives.

## 5. Regional box-truck dealers

Dealer-agreed CSV or emailed individual listing URLs → staff CSV.

---

## What this pilot implements

1. Staff obtains listings via a permitted channel (email workbook, CSV export, dealer sheet).
2. Staff uploads at `/admin/sourcing/intake` (.csv / .xls / .xlsx).
3. Server validates signature, size, and structure; UI shows **preview** with counts and rows.
4. **Nothing is persisted until Import.**
5. Importer preserves identity, evidence, first/last seen, and listing changes; dedupes by VIN then `(source_scope, source_listing_id)`.
6. Missing required evidence (including distance when not locally known) → **Needs verification**.
7. Digest labels **New listing**, **Listing change**, and **Seen again**.

No scraping, no scheduled job, no email send, and **no OpenAI/Tavily** during spreadsheet parse/import.

### Migration

**None required.** Empty `source_url` / `canonical_listing_url` is already allowed by the unique index (empty URLs excluded). Inspection links and workbook status live in existing `spec_evidence` jsonb.
