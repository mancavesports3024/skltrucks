# Google Routes driving distance (Market Comparison)

Staff-only feature. Does **not** change the existing 1,200-mile sourcing classification rule
(that still uses offline straight-line / Census miles on the legacy column
`driving_distance_miles`).

## Legacy field-name mismatch

| Name | Meaning |
|---|---|
| DB `driving_distance_miles` / app `drivingDistanceMiles` | **Estimated straight-line** (Haversine) miles from Joplin when `distance_is_estimate` is true |
| UI label (lead form / list) | **Estimated straight-line distance** |
| `spec_evidence.drivingRoute` | **Estimated city-center driving distance** from Google Routes |
| Market Comparison Transportation | Uses Google unrounded driving miles × profile rate — **never** multiplies straight-line miles by `$/mi` |

No schema rename in this PR (risky). Terminology is clarified in UI and docs only.

## Required production SQL

Apply **before** deploying the app that persists rate/inspection and merges driving-route cache:

`supabase/sourcing-mc-driving-distance-required.sql`

Includes:

1. `sourcing_buying_profile.transportation_rate_per_mile numeric(10,4)` default `2.25`
2. `sourcing_buying_profile.default_inspection_cost numeric(12,2)` default `230.00`
3. RPC `merge_sourcing_lead_driving_route(uuid, jsonb)` — atomic JSONB merge of `spec_evidence.drivingRoute`

Idempotent / additive / backward-compatible. Old app code continues to work after SQL is applied
(extra columns ignored until the new app reads/writes them). Null-only backfill never overwrites
staff-configured values.

### Production sequence

1. Review exact SQL.
2. Apply `sourcing-mc-driving-distance-required.sql` to production (safe to re-run).
3. Confirm columns + RPC exist; confirm authorized Admin can still open `/admin/sourcing`.
4. Merge/deploy application.
5. Save buying-profile rate/inspection; reload; confirm persistence.
6. Calculate driving distance once; confirm unrelated `spec_evidence` keys remain.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_MAPS_ROUTES_API_KEY` | Yes (for live calculate) | Server-only. Never `NEXT_PUBLIC_*`. |
| `GOOGLE_ROUTES_DAILY_LIMIT` | No | **Per-instance best-effort soft guard** (default `100`). Process memory only — **not** a fleet-wide hard daily cap on Vercel. |

### Authoritative quotas

Configure **Google Cloud Routes API quotas + budget alerts** as the hard limit. Do not treat
`GOOGLE_ROUTES_DAILY_LIMIT` as an application-wide daily hard cap.

### Google Cloud setup

1. Enable **Routes API**.
2. API key restricted to Routes API (`computeRoutes`).
3. Store key in Vercel as server-only.
4. Budget alerts + API quotas.

## API security

- Endpoint hardcoded: `POST https://routes.googleapis.com/directions/v2:computeRoutes`
- No user-supplied URL is fetched
- `redirect: "error"`
- Timeout 8s; response body capped (~256 KiB)
- Field mask: `routes.distanceMeters,routes.duration`
- `DRIVE` + `TRAFFIC_UNAWARE`
- Distance must be finite, ≥ 0, ≤ 10_000_000 m
- Duration validated when present (`3723s` form)
- Multi-route responses: deterministic `routes[0]`
- Key only in `X-Goog-Api-Key`; never logged
- On failure, server emits one structured `google_routes_failed` JSON log (HTTP status,
  sanitized Google `status` / `reason` / `message`, failure stage, `VERCEL_ENV`, provider).
  Never logs API key, headers, cookies, JWTs, request/response bodies, lead IDs, or coordinates.
  Staff UI messages stay generic (no provider detail).

Origin: `SKL_DISTANCE_ORIGIN` (Joplin). Destination: offline Census coords from lead `location`.

## Cache freshness (no wall-clock TTL)

Fresh while **all** match:

- Origin lat/lng (`SKL_DISTANCE_ORIGIN`)
- Destination lat/lng (resolved Census coords)
- Provider `google_routes`
- Version `google_routes_v1`

Stale when location resolves to different coords, origin constants change, or version bumps.
Age alone does **not** expire the cache.

**Calculate again** with a fresh cache → `Using saved driving-distance estimate` (0 Google calls).

### Concurrency (honest Vercel limits)

The in-process lead+route lock:

- **Does** prevent common duplicate clicks / concurrent tabs within **one** Node isolate.
- **Does not** coordinate across Vercel serverless instances. Two requests routed to different
  instances for the same lead/route **can each call Google once** before either result is cached.
- After one successful result is saved to `spec_evidence.drivingRoute`, subsequent calculates
  normally reuse the cache (0 Google calls) on every instance.
- **Google Cloud Routes API quotas / budget alerts** are the authoritative hard protection.
- This is acceptable for the current **manual, low-volume** Market Comparison workflow.

Do **not** claim exactly-once provider execution across the Vercel fleet.

## Cache write safety

`merge_sourcing_lead_driving_route` merges only `drivingRoute` into `spec_evidence` jsonb.
Does not erase `inspectionUrl`, country, GVWR, engine, transmission, box, workbook provenance, etc.
Does not bump `listing_last_changed_at` (no digest listing-change).
Does advance `updated_at` via existing trigger (operational).

## Cost defaults (validated server-side)

| Field | Default | Max | Precision |
|---|---|---|---|
| `transportationRatePerMile` | 2.25 | 100 | 4 dp (`numeric(10,4)`) |
| `defaultInspectionCost` | 230.00 | 100_000 | 2 dp / cents |

Rejects negative, NaN/Infinity, malformed strings, excess precision, oversize values.

Transportation = unrounded driving miles × rate → round to cents.
Display miles = nearest whole mile.
Example: 160 × $2.25 = `$360.00`.
