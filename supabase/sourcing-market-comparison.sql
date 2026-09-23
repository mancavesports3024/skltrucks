-- Additive market comparison table for SKL sourcing (Phase 1 pilot).
-- Idempotent. Do NOT apply to production from this PR — apply manually in the
-- documented migrate-before-merge sequence (see header comment below).
-- Does not alter sourcing_truck_leads or overwrite lead evidence/prices.
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
-- Failed comparisons: application inserts status='failed' with error_message and
-- api_usage, report=null — never a successful valuation payload.
-- Secrets / raw model output: not stored; only structured report + usage JSON.

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
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists sourcing_market_comparisons_lead_id_idx
  on public.sourcing_market_comparisons (lead_id);

create index if not exists sourcing_market_comparisons_created_at_idx
  on public.sourcing_market_comparisons (created_at desc);

alter table public.sourcing_market_comparisons enable row level security;

drop policy if exists "Sourcing staff select market comparisons"
  on public.sourcing_market_comparisons;
create policy "Sourcing staff select market comparisons"
  on public.sourcing_market_comparisons for select
  using (public.is_sourcing_staff());

drop policy if exists "Sourcing staff insert market comparisons"
  on public.sourcing_market_comparisons;
create policy "Sourcing staff insert market comparisons"
  on public.sourcing_market_comparisons for insert
  with check (public.is_sourcing_staff());

-- Staff may not update/delete comparison history from the client role.
revoke update, delete on public.sourcing_market_comparisons from authenticated;
grant select, insert on public.sourcing_market_comparisons to authenticated;

-- Force created_by from the authenticated JWT email (cannot spoof via insert payload).
create or replace function public.sourcing_market_comparisons_set_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if jwt_email <> '' then
    new.created_by := jwt_email;
  elsif btrim(coalesce(new.created_by, '')) = '' then
    new.created_by := '';
  else
    new.created_by := lower(btrim(new.created_by));
  end if;
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
