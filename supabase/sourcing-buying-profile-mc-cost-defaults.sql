-- Additive / idempotent: Market Comparison cost defaults on buying profile.
-- Optional for app defaults (2.25 / 230) which already apply in application logic.
-- Apply before staff rate/inspection edits need to persist across sessions.
-- Do NOT apply to production from this PR automatically.

alter table public.sourcing_buying_profile
  add column if not exists transportation_rate_per_mile numeric(10, 4)
    not null default 2.25;

alter table public.sourcing_buying_profile
  add column if not exists default_inspection_cost numeric(12, 2)
    not null default 230.00;

comment on column public.sourcing_buying_profile.transportation_rate_per_mile is
  'Market Comparison default $/mi for Google city-center driving distance. Application default 2.25 when column absent.';

comment on column public.sourcing_buying_profile.default_inspection_cost is
  'Market Comparison default inspection cost USD. Application default 230 when column absent.';

-- Ensure existing rows receive defaults without requiring a resave.
update public.sourcing_buying_profile
set
  transportation_rate_per_mile = coalesce(transportation_rate_per_mile, 2.25),
  default_inspection_cost = coalesce(default_inspection_cost, 230.00);
