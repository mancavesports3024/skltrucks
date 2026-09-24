-- REQUIRED production migration (Market Comparison driving distance + cost defaults).
-- Additive, idempotent, backward-compatible.
--
-- Production sequence (SQL before app deploy):
--   1. Review this file.
--   2. Apply once to production Supabase (safe to re-run).
--   3. Confirm columns + RPC exist.
--   4. Then merge/deploy application that persists rate/inspection and merges drivingRoute.
--
-- Do NOT apply to production from the agent automatically.

-- ---------------------------------------------------------------------------
-- 1) Buying profile cost defaults (editable parameters)
-- ---------------------------------------------------------------------------
-- Application code already supplies 2.25 / 230 when columns are absent.
-- ADD COLUMN ... DEFAULT fills existing rows without requiring a resave.
-- UPDATE only fills NULLs — never overwrites a staff-configured non-null value.

alter table public.sourcing_buying_profile
  add column if not exists transportation_rate_per_mile numeric(10, 4)
    not null default 2.25;

alter table public.sourcing_buying_profile
  add column if not exists default_inspection_cost numeric(12, 2)
    not null default 230.00;

comment on column public.sourcing_buying_profile.transportation_rate_per_mile is
  'Market Comparison default $/mi for city-center driving distance. numeric(10,4). App default 2.25.';

comment on column public.sourcing_buying_profile.default_inspection_cost is
  'Market Comparison default inspection cost USD. numeric(12,2). App default 230.00.';

-- Only backfill NULLs (idempotent; preserves staff edits).
update public.sourcing_buying_profile
set transportation_rate_per_mile = 2.25
where transportation_rate_per_mile is null;

update public.sourcing_buying_profile
set default_inspection_cost = 230.00
where default_inspection_cost is null;

-- ---------------------------------------------------------------------------
-- 2) Atomic spec_evidence.drivingRoute merge (no full-object replace)
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: caller’s JWT + existing sourcing_truck_leads RLS
-- (is_sourcing_staff() = authenticated under Admin-aligned model) apply.
-- No SECURITY DEFINER — not required.
-- Merges only the top-level drivingRoute key into jsonb.
-- Does not touch listing_last_changed_at / match / notes columns.
-- updated_at still advances via existing set_updated_at trigger (operational).

create or replace function public.merge_sourcing_lead_driving_route(
  p_lead_id uuid,
  p_driving_route jsonb
)
returns public.sourcing_truck_leads
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.sourcing_truck_leads;
  v_bytes integer;
begin
  if p_lead_id is null then
    raise exception 'lead id required';
  end if;

  -- Reject null / non-object (array, string, number, boolean).
  if p_driving_route is null or jsonb_typeof(p_driving_route) <> 'object' then
    raise exception 'drivingRoute must be a JSON object';
  end if;

  -- Bound payload size (prevents unbounded JSON / secret dumping into evidence).
  v_bytes := octet_length(p_driving_route::text);
  if v_bytes is null or v_bytes > 8192 then
    raise exception 'drivingRoute payload too large';
  end if;

  -- Require known cache shape (still stored as one jsonb object under drivingRoute).
  if coalesce(p_driving_route->>'version', '') = ''
     or coalesce(p_driving_route->>'provider', '') = ''
     or p_driving_route->'distanceMeters' is null
     or p_driving_route->'distanceMiles' is null
     or p_driving_route->'originLat' is null
     or p_driving_route->'originLng' is null
     or p_driving_route->'destLat' is null
     or p_driving_route->'destLng' is null
     or coalesce(p_driving_route->>'calculatedAt', '') = ''
  then
    raise exception 'drivingRoute missing required fields';
  end if;

  -- Parameterized UPDATE only — no dynamic SQL. Only spec_evidence.drivingRoute key merges.
  update public.sourcing_truck_leads
  set spec_evidence =
    coalesce(spec_evidence, '{}'::jsonb) || jsonb_build_object('drivingRoute', p_driving_route)
  where id = p_lead_id
  returning * into v_row;

  if not found or v_row.id is null then
    raise exception 'lead not found';
  end if;

  return v_row;
end;
$$;

comment on function public.merge_sourcing_lead_driving_route(uuid, jsonb) is
  'SECURITY INVOKER atomic merge of spec_evidence.drivingRoute only. RLS via is_sourcing_staff(). Max 8KiB object with required cache fields.';

revoke all on function public.merge_sourcing_lead_driving_route(uuid, jsonb) from public;
revoke all on function public.merge_sourcing_lead_driving_route(uuid, jsonb) from anon;
grant execute on function public.merge_sourcing_lead_driving_route(uuid, jsonb) to authenticated;
grant execute on function public.merge_sourcing_lead_driving_route(uuid, jsonb) to service_role;
