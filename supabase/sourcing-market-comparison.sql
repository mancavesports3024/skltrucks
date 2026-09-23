-- Additive market comparison table for SKL sourcing (Phase 1 pilot).
-- Idempotent. Do NOT apply to production from this PR — apply manually in the
-- documented migrate-before-merge sequence (see header comment below).
-- Does not alter sourcing_truck_leads or overwrite lead evidence/prices.
--
-- Dependencies (must already exist from supabase/sourcing-schema.sql):
--   - public.is_sourcing_staff()
--   - public.sourcing_truck_leads
-- Optional (not required for access; kept for directory/notes):
--   - public.sourcing_authorized_staff
-- This file fails hard if required deps are missing — it does not create weaker fallbacks.
--
-- Production sequence (migrate BEFORE merge/deploy of the application):
--   1. Review this SQL from the exact release commit.
--   2. Apply this file to production Supabase.
--   3. Verify table, indexes, FK, policies, and RLS.
--   4. Confirm the pre-release app still works (additive table is unused until deploy).
--   5. Only then merge/deploy the application that reads/writes this table.
--   6. Authenticated mock-mode smoke test.
--   7. No live OpenAI call unless separately authorized.
--
-- RLS (defense in depth with application requireSourcingStaff()):
--   SELECT/INSERT require public.is_sourcing_staff() — same bar as inventory /
--   sourcing_truck_leads (any authenticated Auth user). Optional
--   SOURCING_STAFF_EMAILS narrows the app UI only.
--   UPDATE/DELETE are not granted to authenticated/anon (history is append-only).
--   Lead FK: ON DELETE CASCADE — deleting a lead removes its comparisons.
--
-- created_by: forced from auth.uid()::text (spoofed insert payloads ignored).
-- Failed comparisons: status='failed', report=null, error_message set.
-- Secrets / raw model output: not stored.

-- ---------------------------------------------------------------------------
-- Hard dependency checks (no weaker fallback)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_sourcing_staff()') is null then
    raise exception
      'public.is_sourcing_staff() is missing. Apply supabase/sourcing-schema.sql before sourcing-market-comparison.sql.';
  end if;
  if to_regclass('public.sourcing_truck_leads') is null then
    raise exception
      'public.sourcing_truck_leads is missing. Apply supabase/sourcing-schema.sql before sourcing-market-comparison.sql.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Market-comparison authorization helper (same bar as is_sourcing_staff / inventory)
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_sourcing_market_comparisons()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_sourcing_staff(), false);
$$;

revoke all on function public.can_manage_sourcing_market_comparisons() from public;
grant execute on function public.can_manage_sourcing_market_comparisons() to authenticated;
grant execute on function public.can_manage_sourcing_market_comparisons() to anon;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.sourcing_market_comparisons (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sourcing_truck_leads (id) on delete cascade,
  status text not null
    check (status in ('completed', 'failed')),
  assessment text null
    check (
      assessment is null
      or assessment in (
        'potentially_strong_deal',
        'near_comparable_asking_market',
        'potentially_weak_deal',
        'insufficient_evidence'
      )
    ),
  confidence text null
    check (confidence is null or confidence in ('low', 'medium', 'high')),
  report jsonb null,
  api_usage jsonb null,
  error_message text null,
  -- auth.uid()::text of the inserting user (forced by trigger)
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists sourcing_market_comparisons_lead_id_idx
  on public.sourcing_market_comparisons (lead_id);

create index if not exists sourcing_market_comparisons_created_at_idx
  on public.sourcing_market_comparisons (created_at desc);

alter table public.sourcing_market_comparisons enable row level security;

-- ---------------------------------------------------------------------------
-- RLS policies — same is_sourcing_staff() bar as sourcing_truck_leads.
-- Lead visibility: only rows whose lead is selectable under lead RLS are exposed
-- via the EXISTS subquery.
-- ---------------------------------------------------------------------------
drop policy if exists "Sourcing staff select market comparisons"
  on public.sourcing_market_comparisons;
create policy "Sourcing staff select market comparisons"
  on public.sourcing_market_comparisons for select
  using (
    public.is_sourcing_staff()
    and public.can_manage_sourcing_market_comparisons()
    and exists (
      select 1
      from public.sourcing_truck_leads l
      where l.id = sourcing_market_comparisons.lead_id
    )
  );

drop policy if exists "Sourcing staff insert market comparisons"
  on public.sourcing_market_comparisons;
create policy "Sourcing staff insert market comparisons"
  on public.sourcing_market_comparisons for insert
  with check (
    public.is_sourcing_staff()
    and public.can_manage_sourcing_market_comparisons()
    and exists (
      select 1
      from public.sourcing_truck_leads l
      where l.id = lead_id
    )
  );

-- No UPDATE/DELETE policies for authenticated/anon — default deny under RLS.
drop policy if exists "Sourcing staff update market comparisons"
  on public.sourcing_market_comparisons;
drop policy if exists "Sourcing staff delete market comparisons"
  on public.sourcing_market_comparisons;

revoke all on public.sourcing_market_comparisons from anon;
revoke update, delete on public.sourcing_market_comparisons from authenticated;
grant select, insert on public.sourcing_market_comparisons to authenticated;

-- ---------------------------------------------------------------------------
-- created_by integrity — force from auth.uid(); reject spoofed payloads
-- ---------------------------------------------------------------------------
create or replace function public.sourcing_market_comparisons_set_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'sourcing_market_comparisons.created_by requires auth.uid()';
  end if;
  -- Always overwrite client-supplied created_by
  new.created_by := uid::text;
  return new;
end;
$$;

drop trigger if exists sourcing_market_comparisons_set_created_by
  on public.sourcing_market_comparisons;
create trigger sourcing_market_comparisons_set_created_by
  before insert on public.sourcing_market_comparisons
  for each row
  execute function public.sourcing_market_comparisons_set_created_by();

revoke all on function public.sourcing_market_comparisons_set_created_by() from public;
