# Offline workbook distance (straight-line from Joplin, MO)

## Purpose

When staff preview Penske or Hogan workbooks, SKL estimates each truck’s distance from Joplin, Missouri **before import**, using an offline U.S. city/state gazetteer. Resolved distances can turn otherwise-complete trucks into **Confirmed** matches instead of **Needs verification** solely because distance was unknown.

This is **Estimated straight-line distance** (great-circle / haversine). It is **never** driving distance.

## Origin

Named constant: `SKL_DISTANCE_ORIGIN` in `src/lib/sourcing/distance/origin.ts`.

| Field | Value |
| --- | --- |
| Label | Joplin, Missouri |
| Latitude | `37.07522` |
| Longitude | `-94.50126` |
| Source | U.S. Census Bureau 2024 National Places Gazetteer internal point for “Joplin city”, Missouri (GEOID 2937592), key `joplin\|mo` |

## Dataset

| Field | Value |
| --- | --- |
| Source | [U.S. Census Bureau National Places Gazetteer Files](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html) |
| File | `2024_Gaz_place_national.txt` inside `2024_Gaz_place_national.zip` |
| Download URL | `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_place_national.zip` |
| License | U.S. Government work — **public domain** (no copyright) |
| Coordinates | Census internal points (`INTPTLAT` / `INTPTLONG`) |
| Bundled lookup | `data/us-census-places-2024.json` (~1.1 MB, ~32,114 place keys) |
| Metadata | `data/us-census-places-2024.meta.json` |
| Zip SHA-256 | `cf262fc92b2326f7a8c62a89d156a60eb17d64d6d35f7a62310c43bb08972c06` |
| Txt SHA-256 | `ba197a3c0cef828d47981ed7435d820d040d3199bf39a719cd9b11412c59afa6` |

### Generation

```bash
# Download (operator machine; not required at runtime)
curl -fsSL -o 2024_Gaz_place_national.zip \
  'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_place_national.zip'
unzip -o 2024_Gaz_place_national.zip
npx tsx scripts/generate-us-places-lookup.mts ./2024_Gaz_place_national.txt
```

The generator:

1. Normalizes place names (strip city/town/CDP suffixes; collapse `St.`/`Saint`, `Ft.`/`Fort`; lowercase).
2. Keys as `normalizedCity|st` (e.g. `kansas city|mo`).
3. On duplicate keys within a state, prefers FUNCSTAT `A`, then largest `ALAND`.
4. Rounds coordinates to five decimal degrees.

Runtime code **never** downloads this file and makes **no** geocoding / Maps / OpenAI / Tavily network calls for distance.

## Resolution rules

- City **and** state are required. City-only strings stay unresolved.
- Capitalization, punctuation, extra spaces, and `St.`/`Saint` (and `Ft.`/`Fort`) are normalized.
- Ambiguous, malformed, missing, or non-U.S. locations stay **distance unknown** → Needs verification when distance is the only missing criterion (not rejected, not confirmed).
- No ZIP substitution and no “similar city” guessing.
- Canadian / other non-U.S. locations remain unresolved unless a separate authoritative offline dataset is deliberately added and documented.

## Classification

Uses existing buying-profile `preferredMaxDrivingMiles` (default **1,200**):

- Estimated miles `<= max` → distance **pass** (exactly 1,200 passes when max is 1,200).
- Estimated miles `> max` → distance **fail** (Rejected when other required specs pass).
- Unresolved → distance **unknown** (Needs verification).

Other required criteria (engine, transmission, box length, mileage, age, GVWR, etc.) are unchanged. GVWR: `<= 26,000` accepted; `>= 26,001` rejected.

## Persistence

No database migration. Preview is read-only.

On import, existing columns are used:

- `driving_distance_miles` — rounded whole miles
- `distance_is_estimate` — `true`
- `spec_evidence.distance` — method, resolved city/state, origin/dest coordinates, Census source note

## Code map

| Module | Role |
| --- | --- |
| `src/lib/sourcing/distance/*` | Origin, haversine, normalize, resolve, estimate |
| `src/lib/sourcing/intake/workbook/to-intake.ts` | Applies estimate during Penske/Hogan mapping |
| `src/lib/sourcing/match.ts` | Labels estimates as straight-line (never “driving” when estimate) |
| `src/components/admin/sourcing/IntakeCsvForm.tsx` | Preview columns for location / est. mi / method |

## Operator preview (real workbooks — do not import)

```bash
npx tsx -e "
import { readFileSync } from 'node:fs';
import { buildWorkbookPreview } from './src/lib/sourcing/intake/workbook/preview.ts';
import { DEFAULT_BUYING_PROFILE } from './src/types/sourcing.ts';
const buf = readFileSync('/path/to/Pre-Auction-For-Sale-List-9.21.26.xls');
const r = buildWorkbookPreview(buf, 'penske.xls', [], DEFAULT_BUYING_PROFILE);
console.log({ confirmed: r.confirmed, needs: r.needsVerification, rejected: r.rejected });
"
```

Do **not** commit real Penske/Hogan workbooks, VINs, or inspection URLs.
