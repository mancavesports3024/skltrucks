-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)

-- Products table
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  price numeric not null default 0,
  image text default '',
  images text[] default '{}',
  categories text[] default '{}',
  category_slugs text[] default '{}',
  type text default '',
  manufacturer text default '',
  vin text default '',
  year text default '',
  model text default '',
  miles text default '',
  hours text default '',
  condition text default '',
  details jsonb default '{}',
  published boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists products_slug_idx on public.products (slug);
create index if not exists products_published_idx on public.products (published);
create index if not exists products_type_idx on public.products (type);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.products enable row level security;

-- Public can read published products
create policy "Public read published products"
  on public.products for select
  using (published = true);

-- Authenticated users can do everything
create policy "Authenticated users full access"
  on public.products for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Storage bucket for product images
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Public read for product images
create policy "Public read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Authenticated users can upload product images
create policy "Authenticated upload product images"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

create policy "Authenticated update product images"
  on storage.objects for update
  using (bucket_id = 'product-images' and auth.role() = 'authenticated');

create policy "Authenticated delete product images"
  on storage.objects for delete
  using (bucket_id = 'product-images' and auth.role() = 'authenticated');
