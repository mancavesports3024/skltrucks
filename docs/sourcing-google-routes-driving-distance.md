# Google Routes driving distance (Market Comparison)

Staff-only feature. Does **not** change the 1,200-mile sourcing classification rule
(that still uses offline straight-line / Census miles on `driving_distance_miles`).

## Environment

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_MAPS_ROUTES_API_KEY` | Yes (for live calculate) | Server-only. Never `NEXT_PUBLIC_*`. |
| `GOOGLE_ROUTES_DAILY_LIMIT` | No | App soft ceiling (default `100`). Not a Google billing claim. |

### Google Cloud setup

1. Enable **Routes API** on the GCP project.
2. Create an API key restricted to Routes API (`computeRoutes`).
3. Store the key in Vercel as a **server-only** environment variable (Production / Preview as needed).
4. Configure Google Cloud **budget alerts** and API quotas — billing tiers and free allowances vary; do not assume a fixed per-call dollar cost in the product UI.

## API

- Endpoint: `POST https://routes.googleapis.com/directions/v2:computeRoutes`
- Header: `X-Goog-Api-Key` (key only here)
- Field mask: `routes.distanceMeters,routes.duration`
- Mode: `DRIVE`, `routingPreference: TRAFFIC_UNAWARE`
- Origin: `SKL_DISTANCE_ORIGIN` (Joplin city-center Census coords)
- Destination: offline Census gazetteer coords from the lead `location` (no Google geocode)

Label shown to staff: **Estimated driving distance between city centers**

## Cache (no migration)

Stored in `spec_evidence.drivingRoute` jsonb:

- `version`, `provider`, `distanceMeters`, `distanceMiles` (unrounded)
- `durationSeconds`, origin/dest lat/lng, `calculatedAt`, `cityCenterEstimate`

Fresh when origin, destination, provider, and version still match. Location/coord changes invalidate.

Updating the cache **does not**:

- change `driving_distance_miles` / `distance_is_estimate`
- bump `listing_last_changed_at`
- create digest listing-change events
- alter call notes or classification

## Cost defaults

Application defaults (always, even if SQL not applied):

- `transportationRatePerMile` = `2.25`
- `defaultInspectionCost` = `230.00`

Optional persistence: `supabase/sourcing-buying-profile-mc-cost-defaults.sql`

Transportation = unrounded driving miles × rate, rounded to cents.
Display miles = nearest whole mile.
Example: 160 mi × $2.25 = $360.00

## Safeguards

- Explicit **Calculate driving distance** button — never on page render
- At most **one** Google request per click (zero when cache fresh)
- In-process lock: one active calculation per lead
- Daily app limit + provider 429/timeout/auth handling
- Fallback: keep straight-line; leave Transportation blank; show manual-entry message
- Never multiply straight-line miles by the rate as if it were driving mileage
