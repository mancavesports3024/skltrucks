-- Private truck sourcing tool schema
-- Run in Supabase SQL Editor BEFORE production use (after schema.sql).
-- Safe for existing DBs: uses IF NOT EXISTS / DROP IF EXISTS / additive ALTERs.
-- No public read policies.
--
-- Authorization (fail-closed):
--   SQL/RLS: is_sourcing_staff() is true only for JWT users with auth.uid(),
--   a non-empty JWT email, and an active row in sourcing_authorized_staff.
--   Application: requireSourcingStaff() also enforces optional SOURCING_STAFF_EMAILS.
--   Database authorization does NOT read Vercel env vars.
--   If an older database still has inventory-aligned is_sourcing_staff(), apply
--   supabase/sourcing-staff-rls-failclosed.sql.

-- ---------------------------------------------------------------------------
-- Authorized staff directory (required for RLS)
-- ---------------------------------------------------------------------------
create table if not exists public.sourcing_authorized_staff (
  email text primary key,
  display_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Additive for databases that applied an earlier draft without active
alter table public.sourcing_authorized_staff
  add column if not exists active boolean not null default true;

alter table public.sourcing_authorized_staff enable row level security;

-- Fail-closed: active directory row required (not merely authenticated).
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

drop policy if exists "Staff read own sourcing allowlist row"
  on public.sourcing_authorized_staff;
drop policy if exists "Authenticated read sourcing staff directory"
  on public.sourcing_authorized_staff;
drop policy if exists "Sourcing staff read authorized staff directory"
  on public.sourcing_authorized_staff;
-- Directory readable only by active authorized sourcing staff
create policy "Sourcing staff read authorized staff directory"
  on public.sourcing_authorized_staff for select
  using (public.is_sourcing_staff());

revoke all on public.sourcing_authorized_staff from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.sourcing_authorized_staff from authenticated;
grant select on public.sourcing_authorized_staff to authenticated;

-- Bootstrap SKL primary account
insert into public.sourcing_authorized_staff (email, display_name, active)
values ('skltrucksllc@gmail.com', 'SKL Trucks', true)
on conflict (email) do update
  set active = true,
      display_name = excluded.display_name;

-- ---------------------------------------------------------------------------
-- Single-flight lock for internet search (prevents overlapping paid provider runs)
-- ---------------------------------------------------------------------------
create table if not exists public.sourcing_search_lock (
  id text primary key default 'global' check (id = 'global'),
  holder_email text not null default '',
  acquired_at timestamptz,
  expires_at timestamptz not null default '1970-01-01T00:00:00Z'::timestamptz
);

insert into public.sourcing_search_lock (id, holder_email, expires_at)
values ('global', '', '1970-01-01T00:00:00Z'::timestamptz)
on conflict (id) do nothing;

alter table public.sourcing_search_lock enable row level security;

drop policy if exists "Sourcing staff read search lock"
  on public.sourcing_search_lock;
create policy "Sourcing staff read search lock"
  on public.sourcing_search_lock for select
  using (public.is_sourcing_staff());

create or replace function public.try_acquire_sourcing_search_lock(
  p_holder text,
  p_ttl_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer := 0;
  ttl integer := greatest(60, least(coalesce(p_ttl_seconds, 600), 3600));
  holder text := lower(btrim(coalesce(p_holder, '')));
begin
  if holder = '' then
    return false;
  end if;
  if not public.is_sourcing_staff() then
    return false;
  end if;

  update public.sourcing_search_lock
  set
    holder_email = holder,
    acquired_at = now(),
    expires_at = now() + make_interval(secs => ttl)
  where id = 'global'
    and (
      expires_at <= now()
      or holder_email = ''
      or lower(btrim(holder_email)) = holder
    );

  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

create or replace function public.release_sourcing_search_lock(p_holder text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer := 0;
  holder text := lower(btrim(coalesce(p_holder, '')));
begin
  if holder = '' then
    return false;
  end if;

  update public.sourcing_search_lock
  set
    holder_email = '',
    acquired_at = null,
    expires_at = '1970-01-01T00:00:00Z'::timestamptz
  where id = 'global'
    and lower(btrim(holder_email)) = holder;

  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

revoke all on function public.try_acquire_sourcing_search_lock(text, integer) from public;
revoke all on function public.release_sourcing_search_lock(text) from public;
grant execute on function public.try_acquire_sourcing_search_lock(text, integer) to authenticated;
grant execute on function public.release_sourcing_search_lock(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Buying profile
-- ---------------------------------------------------------------------------
create table if not exists public.sourcing_buying_profile (
  id text primary key default 'default',
  require_cummins boolean not null default true,
  require_automatic boolean not null default true,
  required_box_lengths_ft integer[] not null default '{24,26,28}',
  max_gvwr_lbs integer not null default 26000,
  gvwr_must_be_strictly_below boolean not null default true,
  max_mileage integer not null default 275000,
  max_age_years integer not null default 9,
  prefer_liftgate boolean not null default true,
  preferred_max_driving_miles integer not null default 1200,
  max_price numeric null,
  origin_label text not null default 'Joplin, Missouri',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

drop trigger if exists sourcing_buying_profile_updated_at on public.sourcing_buying_profile;
create trigger sourcing_buying_profile_updated_at
  before update on public.sourcing_buying_profile
  for each row execute function public.set_updated_at();

insert into public.sourcing_buying_profile (id)
values ('default')
on conflict (id) do nothing;

alter table public.sourcing_buying_profile enable row level security;

drop policy if exists "Authenticated manage sourcing buying profile"
  on public.sourcing_buying_profile;
drop policy if exists "Sourcing staff manage buying profile"
  on public.sourcing_buying_profile;
create policy "Sourcing staff manage buying profile"
  on public.sourcing_buying_profile for all
  using (public.is_sourcing_staff())
  with check (public.is_sourcing_staff());

-- ---------------------------------------------------------------------------
-- Supplier contacts
-- ---------------------------------------------------------------------------
create table if not exists public.sourcing_supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text not null default '',
  role text not null default '',
  phone text not null default '',
  email text not null default '',
  source_url text not null default '',
  supplier_type text not null default '',
  dealer_wholesale_status text not null default '',
  last_contact_date date,
  next_follow_up_date date,
  call_notes text not null default '',
  driving_distance_miles numeric,
  phone_verified boolean not null default false,
  research_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sourcing_supplier_contacts_follow_up_idx
  on public.sourcing_supplier_contacts (next_follow_up_date);
create index if not exists sourcing_supplier_contacts_company_idx
  on public.sourcing_supplier_contacts (lower(company));

drop trigger if exists sourcing_supplier_contacts_updated_at on public.sourcing_supplier_contacts;
create trigger sourcing_supplier_contacts_updated_at
  before update on public.sourcing_supplier_contacts
  for each row execute function public.set_updated_at();

alter table public.sourcing_supplier_contacts enable row level security;

drop policy if exists "Authenticated manage sourcing supplier contacts"
  on public.sourcing_supplier_contacts;
drop policy if exists "Sourcing staff manage supplier contacts"
  on public.sourcing_supplier_contacts;
create policy "Sourcing staff manage supplier contacts"
  on public.sourcing_supplier_contacts for all
  using (public.is_sourcing_staff())
  with check (public.is_sourcing_staff());

-- ---------------------------------------------------------------------------
-- Truck leads
-- ---------------------------------------------------------------------------
create table if not exists public.sourcing_truck_leads (
  id uuid primary key default gen_random_uuid(),
  seller text not null default '',
  supplier_contact_id uuid references public.sourcing_supplier_contacts (id) on delete set null,
  source_url text not null default '',
  -- Scope (seller slug or source host) + listing id — uniqueness is per scope
  source_scope text not null default '',
  source_listing_id text not null default '',
  canonical_listing_url text not null default '',
  stock_number text not null default '',
  vin text not null default '',
  year integer,
  make_model text not null default '',
  box_length_ft numeric,
  box_length_raw text not null default '',
  engine text not null default '',
  engine_is_cummins boolean,
  transmission text not null default '',
  transmission_is_automatic boolean,
  listed_weight_lbs integer,
  listed_weight_term text not null default 'unknown'
    check (listed_weight_term in ('gvwr', 'gvw', 'unknown', 'other')),
  manufacturer_gvwr_lbs integer,
  gvwr_door_plate_verified boolean not null default false,
  mileage integer,
  has_liftgate boolean,
  liftgate_notes text not null default '',
  price numeric,
  location text not null default '',
  driving_distance_miles numeric,
  distance_is_estimate boolean not null default false,
  date_last_checked date,
  verification_notes text not null default '',
  workflow_status text not null default 'new'
    check (workflow_status in (
      'new',
      'researching',
      'contacted',
      'waiting',
      'passed',
      'purchased',
      'closed'
    )),
  skl_call_notes text not null default '',
  research_uncertainty_labels text[] not null default '{}',
  is_seed_research boolean not null default false,
  seed_source text not null default '',
  match_status text not null default 'needs_verification'
    check (match_status in (
      'confirmed_match',
      'needs_verification',
      'does_not_match',
      'out_of_range_opportunity'
    )),
  match_reasons jsonb not null default '[]',
  -- Digest timestamps: staff notes / match recalcs must NOT bump listing_last_changed_at
  listing_first_seen_at timestamptz not null default now(),
  listing_last_changed_at timestamptz not null default now(),
  -- Re-observation on intake (unchanged listing seen again) — separate from call notes
  listing_last_seen_at timestamptz not null default now(),
  -- Evidence snippets for required specs (engine / transmission / box / gvwr)
  spec_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Additive columns for databases that applied an earlier draft of this schema
alter table public.sourcing_truck_leads
  add column if not exists source_scope text not null default '';
alter table public.sourcing_truck_leads
  add column if not exists listing_first_seen_at timestamptz not null default now();
alter table public.sourcing_truck_leads
  add column if not exists listing_last_changed_at timestamptz not null default now();
alter table public.sourcing_truck_leads
  add column if not exists listing_last_seen_at timestamptz not null default now();
alter table public.sourcing_truck_leads
  add column if not exists spec_evidence jsonb not null default '{}'::jsonb;

-- Backfill last_seen from first_seen where earlier drafts lacked the column semantics
update public.sourcing_truck_leads
set listing_last_seen_at = coalesce(listing_last_seen_at, listing_first_seen_at, created_at, now())
where listing_last_seen_at is null
   or listing_last_seen_at < coalesce(listing_first_seen_at, created_at);

create index if not exists sourcing_truck_leads_match_status_idx
  on public.sourcing_truck_leads (match_status);
create index if not exists sourcing_truck_leads_updated_at_idx
  on public.sourcing_truck_leads (updated_at desc);
create index if not exists sourcing_truck_leads_date_checked_idx
  on public.sourcing_truck_leads (date_last_checked desc nulls last);
create index if not exists sourcing_truck_leads_listing_first_seen_idx
  on public.sourcing_truck_leads (listing_first_seen_at desc);
create index if not exists sourcing_truck_leads_listing_changed_idx
  on public.sourcing_truck_leads (listing_last_changed_at desc);
create index if not exists sourcing_truck_leads_listing_seen_idx
  on public.sourcing_truck_leads (listing_last_seen_at desc);

-- Duplicate prevention: VIN when present (global)
create unique index if not exists sourcing_truck_leads_vin_unique
  on public.sourcing_truck_leads (upper(vin))
  where vin is not null and btrim(vin) <> '';

-- Replace global source_listing_id uniqueness with scoped uniqueness
drop index if exists sourcing_truck_leads_source_listing_id_unique;
create unique index if not exists sourcing_truck_leads_scoped_listing_unique
  on public.sourcing_truck_leads (lower(source_scope), lower(source_listing_id))
  where source_scope is not null and btrim(source_scope) <> ''
    and source_listing_id is not null and btrim(source_listing_id) <> '';

-- Duplicate prevention: canonical individual listing URL when present
create unique index if not exists sourcing_truck_leads_canonical_url_unique
  on public.sourcing_truck_leads (lower(canonical_listing_url))
  where canonical_listing_url is not null and btrim(canonical_listing_url) <> '';

-- Backfill source_scope from seller for any rows that lack it (idempotent)
update public.sourcing_truck_leads
set source_scope = lower(regexp_replace(btrim(seller), '\s+', '-', 'g'))
where btrim(coalesce(source_scope, '')) = ''
  and btrim(coalesce(seller, '')) <> '';

drop trigger if exists sourcing_truck_leads_updated_at on public.sourcing_truck_leads;
create trigger sourcing_truck_leads_updated_at
  before update on public.sourcing_truck_leads
  for each row execute function public.set_updated_at();

alter table public.sourcing_truck_leads enable row level security;

drop policy if exists "Authenticated manage sourcing truck leads"
  on public.sourcing_truck_leads;
drop policy if exists "Sourcing staff manage truck leads"
  on public.sourcing_truck_leads;
create policy "Sourcing staff manage truck leads"
  on public.sourcing_truck_leads for all
  using (public.is_sourcing_staff())
  with check (public.is_sourcing_staff());

-- ---------------------------------------------------------------------------
-- Internet search runs (nonprod pilot reports — no cron)
-- ---------------------------------------------------------------------------
create table if not exists public.sourcing_search_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'completed'
    check (status in ('completed', 'partial', 'failed')),
  buying_profile_snapshot jsonb not null default '{}'::jsonb,
  queries text[] not null default '{}',
  sources_searched text[] not null default '{}',
  results_examined integer not null default 0,
  new_leads integer not null default 0,
  confirmed_matches integer not null default 0,
  needs_verification integer not null default 0,
  duplicates_or_rejected integer not null default 0,
  contacts_saved integer not null default 0,
  api_usage jsonb not null default '{}'::jsonb,
  errors text[] not null default '{}',
  report jsonb not null default '{}'::jsonb,
  created_by_email text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists sourcing_search_runs_created_at_idx
  on public.sourcing_search_runs (created_at desc);

alter table public.sourcing_search_runs enable row level security;

drop policy if exists "Sourcing staff manage search runs"
  on public.sourcing_search_runs;
create policy "Sourcing staff manage search runs"
  on public.sourcing_search_runs for all
  using (public.is_sourcing_staff())
  with check (public.is_sourcing_staff());
