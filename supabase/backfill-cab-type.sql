-- Run in Supabase → SQL Editor
-- https://supabase.com/dashboard → your project → SQL Editor

-- =============================================================================
-- STEP 1: Check if your trucks are still in the database
-- =============================================================================
select count(*) as total_trucks from public.products;

select id, name, type, cab_type, published, created_at
from public.products
order by created_at desc;

-- =============================================================================
-- STEP 2: Backfill cab_type from existing type column (safe if you had rows before)
-- =============================================================================
alter table public.products add column if not exists cab_type text default '';

update public.products
set cab_type = type
where (cab_type is null or cab_type = '')
  and type is not null
  and type != '';

create index if not exists products_cab_type_idx on public.products (cab_type);

-- Check again after backfill
select count(*) as trucks_with_cab_type
from public.products
where cab_type is not null and cab_type != '';
