-- Additive market comparison table for SKL sourcing (Phase 1 pilot).
-- Idempotent. Do NOT apply to production from this PR — document and apply manually after merge.
-- Does not alter sourcing_truck_leads or overwrite lead evidence/prices.

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
