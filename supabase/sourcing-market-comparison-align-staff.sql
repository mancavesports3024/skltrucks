-- Additive: restore market-comparison RLS to the same bar as inventory / leads.
-- Idempotent. Safe to re-apply.
--
-- Why: PR #23 tightened can_manage_sourcing_market_comparisons() to also require
-- an active sourcing_authorized_staff row. That overrode the PR #14 agreement that
-- sourcing matches inventory admin (any authenticated Auth user; optional
-- SOURCING_STAFF_EMAILS narrows the app only).
--
-- Apply in production Supabase SQL Editor after deploy of the matching app fix.
-- Does not alter table data, lead counts, or comparison rows.

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
