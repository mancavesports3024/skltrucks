-- =============================================================================
-- HOTFIX: Align private sourcing RLS with inventory Admin authorization
-- File: supabase/sourcing-rls-admin-aligned.sql
-- Idempotent. Does not drop tables or delete staff/lead/inspection data.
--
-- VERIFIED ADMIN RULE (inventory):
--   App middleware: supabase.auth.getUser() must return a user for /admin
--   Products RLS:   auth.role() = 'authenticated'
--   No inventory email allowlist / staff table / role claim
--
-- REQUIRED SOURCING RULE (business):
--   Can access inventory Admin ⇔ Can access Sourcing
--   Therefore is_sourcing_staff() = auth.role() = 'authenticated'
--
-- ACCEPTED IMPLICATION:
--   Every authenticated Supabase Auth account can read/write private sourcing
--   data directly via PostgREST/RLS (same as inventory products). Anonymous
--   remains denied.
--
-- sourcing_authorized_staff:
--   Retained. Not consulted for authorization. Do not DROP or DELETE rows.
--
-- PRODUCTION SEQUENCE (human — do not auto-apply from CI)
--   1. Review exact app + this SQL
--   2. Apply this SQL to production
--   3. Confirm currently signed-in inventory admin can open /admin/sourcing
--   4. Merge/deploy the application
--   5. Reconfirm signed-out denial + signed-in Admin access
-- =============================================================================

create or replace function public.is_sourcing_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Same bar as public.products "Authenticated users full access"
  select coalesce(auth.role() = 'authenticated', false);
$$;

revoke all on function public.is_sourcing_staff() from public;
grant execute on function public.is_sourcing_staff() to authenticated;
grant execute on function public.is_sourcing_staff() to anon;

-- Market-comparison helper follows the same Admin-equivalent rule
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

-- Directory retained but unused for auth: authenticated Admins may read it
alter table public.sourcing_authorized_staff enable row level security;

drop policy if exists "Staff read own sourcing allowlist row"
  on public.sourcing_authorized_staff;
drop policy if exists "Authenticated read sourcing staff directory"
  on public.sourcing_authorized_staff;
drop policy if exists "Sourcing staff read authorized staff directory"
  on public.sourcing_authorized_staff;

create policy "Authenticated read sourcing staff directory"
  on public.sourcing_authorized_staff for select
  using (auth.role() = 'authenticated');

-- Keep writes off the authenticated role (directory managed via SQL editor /
-- service role). Do not delete existing rows.
revoke all on public.sourcing_authorized_staff from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.sourcing_authorized_staff from authenticated;
grant select on public.sourcing_authorized_staff to authenticated;

-- Re-assert private sourcing policies still call is_sourcing_staff()
-- (now Admin-equivalent). Anonymous remains denied via RLS + revoke.
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
    'sourcing_market_comparisons'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon', t);
    end if;
  end loop;
end $$;

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
