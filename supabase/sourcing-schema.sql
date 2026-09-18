-- Private truck sourcing tool schema
-- Run in Supabase SQL Editor AFTER production use (after schema.sql).
-- Safe for existing DBs: uses IF NOT EXISTS / DROP IF EXISTS / additive ALTERs.
-- No public read policies. Access is limited to emails in sourcing_authorized_staff
-- (not every authenticated user).

-- ---------------------------------------------------------------------------
-- Authorized SKL staff (explicit allowlist — required for RLS + app checks)
-- ---------------------------------------------------------------------------
create table if not exists public.sourcing_authorized_staff (
  email text primary key,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.sourcing_authorized_staff enable row level security;

-- Staff may see their own allowlist row (optional UX); no public access
drop policy if exists "Staff read own sourcing allowlist row"
  on public.sourcing_authorized_staff;
create policy "Staff read own sourcing allowlist row"
  on public.sourcing_authorized_staff for select
  using (
    nullif(lower(coalesce(auth.email(), '')), '') is not null
    and lower(email) = lower(auth.email())
  );

-- Bootstrap SKL primary account (add more rows in SQL Editor as needed)
insert into public.sourcing_authorized_staff (email, display_name)
values ('skltrucksllc@gmail.com', 'SKL Trucks')
on conflict (email) do nothing;

-- Staff authorization uses auth.email() (JWT email claim). Do not grant access when unset.
create or replace function public.is_sourcing_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sourcing_authorized_staff s
    where nullif(lower(coalesce(auth.email(), '')), '') is not null
      and lower(s.email) = lower(auth.email())
  );
$$;

revoke all on function public.is_sourcing_staff() from public;
grant execute on function public.is_sourcing_staff() to authenticated;
grant execute on function public.is_sourcing_staff() to anon;

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
