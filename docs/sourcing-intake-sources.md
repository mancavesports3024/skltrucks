# Box-truck listing intake — recurring sources (nonprod pilot)

SKL needs **repeatable individual listings**, not category search pages. A public inventory search URL is **not** treated as a dependable daily feed (layout changes, login walls, ToS, and incomplete specs).

## 1. Penske Used Trucks (fleet / wholesale)

| Channel | Status for SKL |
| --- | --- |
| Public search page (`penskeusedtrucks.com/search-inventory`) | **Not** a permitted automated daily feed |
| Weekly inventory email via Penske dealer sales rep | **Permitted** once SKL registers as a dealer/buyer and asks the assigned rep to email inventory |
| Wholesale / auction dealer account | Permitted after dealer license verification; still not a documented public API |
| CSV / API download | **Not publicly documented** — ask rep whether a spreadsheet export can be emailed |

**Pilot path today:** staff paste or upload the weekly email/spreadsheet into **Staff-reviewed CSV import**.

Optional (flagged off): staff may paste up to 10 public `/unit-{id}/` URLs into Search for inspect-only enrichment — see `docs/sourcing-penske-url-inspection.md`. Not a substitute for Excel bulk intake; requires written Penske authorization before enabling.

**Needed for automation:** written OK from Penske for a recurring CSV/email attachment, plus a stable column mapping (stock #, VIN, URL, price, mileage, location).

## 2. Ryder (and similar national fleet remarketers)

| Channel | Status for SKL |
| --- | --- |
| Public used-truck / remarketing pages | **Not** assumed as a scrapeable daily feed |
| Account manager / wholesale email lists | **Permitted** when Ryder (or SOARR-style partners) send SKL individual units |
| Dealer portal export | Only if SKL has an account and export is explicitly allowed |
| Public API | **Not identified** for general use |

**Pilot path today:** same staff-reviewed CSV when an email or export arrives.

**Needed for automation:** named contact who will send CSV/email of individual box trucks (URL + stock/VIN), on a set cadence.

## 3. Regional box-truck dealers (e.g. DeBary Truck Sales, Miller Used Trucks)

| Channel | Status for SKL |
| --- | --- |
| Individual listing URLs shared by phone/email | **Permitted** — staff already records these as leads |
| Dealer-provided CSV / price sheet | **Permitted** when the dealer agrees to send inventory periodically |
| Public dealer search / marketplace aggregate pages | **Not** treated as a reliable automated feed without written access |

**Pilot path today:** CSV import with `source_scope` = dealer slug and the dealer’s stock number as `source_listing_id`.

**Needed for automation:** a dealer who emails a CSV (or grants a feed) with stock #, listing URL, and as many specs as they publish.

---

## What this pilot implements

Because none of the three sources yet provide a dependable, already-authorized machine feed in this environment, the nonprod pilot ships a **staff-reviewed CSV importer**:

1. Staff obtains listings via a permitted channel (email, CSV export, dealer sheet).
2. Staff uploads CSV at `/admin/sourcing/intake`.
3. Importer preserves listing URL, source scope, stock/listing id, date observed, and per-spec evidence.
4. Missing Cummins / automatic / box length / manufacturer GVWR **evidence** → **Needs verification**.
5. Dedupes by VIN (when present) else `(source_scope, source_listing_id)`.
6. Tracks **first seen**, **last seen**, and **listing changes** separately from SKL call notes.
7. Digest preview labels **New listing**, **Listing change**, and **Seen again**.

No scraping, no scheduled job, and no email send in this pass.
