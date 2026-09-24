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
begin
  if p_lead_id is null then
    raise exception 'lead id required';
  end if;
  if p_driving_route is null or jsonb_typeof(p_driving_route) <> 'object' then
    raise exception 'drivingRoute must be a JSON object';
  end if;

  update public.sourcing_truck_leads
  set spec_evidence =
    coalesce(spec_evidence, '{}'::jsonb) || jsonb_build_object('drivingRoute', p_driving_route)
  where id = p_lead_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'lead not found';
  end if;

  return v_row;
end;
$$;

comment on function public.merge_sourcing_lead_driving_route(uuid, jsonb) is
  'Atomically merge spec_evidence.drivingRoute without replacing other evidence keys. Staff RLS via invoker.';

revoke all on function public.merge_sourcing_lead_driving_route(uuid, jsonb) from public;
grant execute on function public.merge_sourcing_lead_driving_route(uuid, jsonb) to authenticated;
grant execute on function public.merge_sourcing_lead_driving_route(uuid, jsonb) to service_role;
