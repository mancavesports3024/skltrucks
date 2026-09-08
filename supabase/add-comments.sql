-- Run this in Supabase SQL Editor for existing projects.
-- Adds a comments field for seller notes on each inventory item
-- (e.g. new tires, recent parts) shown on the product page.

alter table public.products add column if not exists comments text default '';
