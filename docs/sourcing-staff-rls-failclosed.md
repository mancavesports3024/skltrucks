# Private sourcing staff RLS (fail-closed)

## Why

`public.is_sourcing_staff()` previously returned true for any authenticated
Supabase Auth user (`auth.role() = 'authenticated'`). Application
`requireSourcingStaff()` cannot protect **direct PostgREST/Supabase REST**
access to private sourcing tables, including `spec_evidence.inspectionUrl`
capability-token URLs.

## Fix

Apply `supabase/sourcing-staff-rls-failclosed.sql` so `is_sourcing_staff()` is
true only when:

1. `auth.uid()` is present
2. JWT `email` is present and non-empty
3. `sourcing_authorized_staff` has a matching row (case-insensitive)
4. `active = true`

Database authorization does **not** read `SOURCING_STAFF_EMAILS`.
The app continues to require **both** the env allowlist check and this RPC.

## Production sequence (human)

1. Review exact SQL in `supabase/sourcing-staff-rls-failclosed.sql`
2. Apply SQL to **production** Supabase SQL Editor
3. Run four-identity direct-RLS tests (`scripts/verify-sourcing-rls-four-identity.mts` against prod keys, or equivalent)
4. Confirm authorized SKL access (`skltrucksllc@gmail.com`) still works in UI
5. Only then merge/deploy the matching repository change
6. Only after deployment + verification may the Penske workbook be re-imported

## Verification queries (read-only)

```sql
select pg_get_functiondef('public.is_sourcing_staff()'::regprocedure);

select count(*) as inspection_url_count
from public.sourcing_truck_leads
where spec_evidence ? 'inspectionUrl'
  and nullif(btrim(spec_evidence ->> 'inspectionUrl'), '') is not null;

select case when exists (
  select 1 from public.sourcing_authorized_staff
  where lower(email) = lower('skltrucksllc@gmail.com') and active
) then 'present_active' else 'MISSING' end;
```

Do not print emails other than confirming the SKL row, and never print inspection URLs.
