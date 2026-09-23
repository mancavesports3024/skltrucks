-- =============================================================================
-- HOTFIX: Fail-closed private sourcing staff authorization
-- File: supabase/sourcing-staff-rls-failclosed.sql
-- Idempotent / additive. Does not alter lead rows or inventory/product policies.
--
-- PROBLEM
--   public.is_sourcing_staff() currently returns true for any JWT with
--   auth.role() = 'authenticated'. Application requireSourcingStaff() cannot
--   protect direct Supabase REST/PostgREST access to private sourcing tables,
--   including spec_evidence.inspectionUrl capability-token URLs.
--
-- FIX
--   is_sourcing_staff() returns true only when:
--     1) auth.uid() is present
--     2) JWT email is present and non-empty
--     3) public.sourcing_authorized_staff has a matching row (case-insensitive)
--     4) that row has active = true
--   Database authorization does NOT read Vercel SOURCING_STAFF_EMAILS.
--   The application must continue to require BOTH the env allowlist check and
--   this RPC.
--
-- PRODUCTION SEQUENCE (human-operated — do not auto-apply from CI)
--   1) Review this exact SQL
--   2) Apply to production Supabase SQL Editor
--   3) Run four-identity direct-RLS tests (anon / outsider / inactive / active)
--   4) Confirm authorized SKL access still works
--   5) Only then merge/deploy the matching repository change
--   6) Only after deployment + verification may the Penske workbook be re-imported
--
-- Does NOT change public inventory/product RLS.
-- =============================================================================

-- Ensure directory table + active column exist (no-op if already present)
create table if not exists public.sourcing_authorized_staff (
  email text primary key,
  display_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.sourcing_authorized_staff
  add column if not exists active boolean not null default true;

alter table public.sourcing_authorized_staff enable row level security;

-- Bootstrap / confirm primary SKL account remains active (idempotent)
insert into public.sourcing_authorized_staff (email, display_name, active)
values ('skltrucksllc@gmail.com', 'SKL Trucks', true)
on conflict (email) do update
  set active = true,
      display_name = excluded.display_name;

-- Fail-closed staff check (security definer reads directory bypassing RLS)
create or replace function public.is_sourcing_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '') is not null
    and exists (
      select 1
      from public.sourcing_authorized_staff s
      where lower(s.email) = lower(trim(auth.jwt() ->> 'email'))
        and s.active is true
    );
$$;

revoke all on function public.is_sourcing_staff() from public;
grant execute on function public.is_sourcing_staff() to authenticated;
grant execute on function public.is_sourcing_staff() to anon;

-- Market-comparison helper stays delegated to is_sourcing_staff() (now fail-closed)
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
-- sourcing_authorized_staff: stop "any authenticated" SELECT; staff-only read.
-- Writes remain service-role / SQL-editor only (no authenticated write policy).
-- ---------------------------------------------------------------------------
drop policy if exists "Staff read own sourcing allowlist row"
  on public.sourcing_authorized_staff;
drop policy if exists "Authenticated read sourcing staff directory"
  on public.sourcing_authorized_staff;
drop policy if exists "Sourcing staff read authorized staff directory"
  on public.sourcing_authorized_staff;

create policy "Sourcing staff read authorized staff directory"
  on public.sourcing_authorized_staff for select
  using (public.is_sourcing_staff());

revoke all on public.sourcing_authorized_staff from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.sourcing_authorized_staff from authenticated;
grant select on public.sourcing_authorized_staff to authenticated;

-- ---------------------------------------------------------------------------
-- Defense in depth: revoke anon table privileges on all private sourcing tables.
-- RLS already denies; grants should not imply public access.
-- Existing authenticated policies continue to use is_sourcing_staff().
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'sourcing_truck_leads',
    'sourcing_supplier_contacts',
    'sourcing_buying_profile',
    'sourcing_search_runs',
    'sourcing_search_lock',
    'sourcing_market_comparisons',
    'sourcing_authorized_staff'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon', t);
    end if;
  end loop;
end $$;

-- Re-assert lead / contact / profile / search-run policies still reference helper
-- (drop+create keeps names stable if an older DB drifted)
drop policy if exists "Sourcing staff manage truck leads" on public.sourcing_truck_leads;
create policy "Sourcing staff manage truck leads"
  on public.sourcing_truck_leads for all
  using (public.is_sourcing_staff())
  with check (public.is_sourcing_staff());

drop policy if exists "Sourcing staff manage supplier contacts"
  on public.sourcing_supplier_contacts;
create policy "Sourcing staff manage supplier contacts"
  on public.sourcing_supplier_contacts for all
  using (public.is_sourcing_staff())
  with check (public.is_sourcing_staff());

drop policy if exists "Sourcing staff manage buying profile"
  on public.sourcing_buying_profile;
create policy "Sourcing staff manage buying profile"
  on public.sourcing_buying_profile for all
  using (public.is_sourcing_staff())
  with check (public.is_sourcing_staff());

drop policy if exists "Sourcing staff manage search runs"
  on public.sourcing_search_runs;
create policy "Sourcing staff manage search runs"
  on public.sourcing_search_runs for all
  using (public.is_sourcing_staff())
  with check (public.is_sourcing_staff());

drop policy if exists "Sourcing staff read search lock"
  on public.sourcing_search_lock;
create policy "Sourcing staff read search lock"
  on public.sourcing_search_lock for select
  using (public.is_sourcing_staff());

-- Market comparisons (only if table exists)
do $$
begin
  if to_regclass('public.sourcing_market_comparisons') is not null then
    execute $p$
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
    $p$;
    revoke all on public.sourcing_market_comparisons from anon;
    revoke update, delete on public.sourcing_market_comparisons from authenticated;
    grant select, insert on public.sourcing_market_comparisons to authenticated;
  end if;
end $$;
