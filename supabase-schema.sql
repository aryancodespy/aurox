-- Aurox Supabase schema
-- Run this file in the Supabase SQL editor.
--
-- This setup keeps the frontend static on Netlify while moving store data
-- and admin workflows into Supabase.
--
-- Before using image uploads:
-- 1. Create a public Storage bucket named `product-images`
-- 2. Create your admin user in Supabase Auth
--    Suggested admin email: business.aryanahmed@gmail.com

create extension if not exists "pgcrypto";

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  price numeric(10, 2) not null check (price >= 0),
  color text not null,
  material text not null,
  short_description text not null default '',
  description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Extra admin-friendly fields used by the current dashboard
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  seo_title text not null default '',
  seo_description text not null default '',
  product_highlights jsonb not null default '[]'::jsonb
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  -- Optional storage path so admin can delete/replace uploaded files safely
  storage_path text
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null check (size in ('M', 'L', 'XL')),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, size)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  phone text not null,
  address text not null,
  division text not null,
  delivery_location text not null,
  product_total numeric(10, 2) not null default 0,
  delivery_charge numeric(10, 2) not null default 0,
  amount_to_pay_now numeric(10, 2) not null default 0,
  amount_to_pay_on_delivery numeric(10, 2) not null default 0,
  status text not null default 'Pending Delivery Charge',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  size text not null check (size in ('M', 'L', 'XL')),
  quantity integer not null check (quantity > 0),
  price numeric(10, 2) not null check (price >= 0)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payment_method text not null,
  transaction_id text not null,
  amount numeric(10, 2) not null default 0,
  status text not null default 'Payment Submitted',
  created_at timestamptz not null default now()
);

create table if not exists public.shipping_settings (
  id uuid primary key default gen_random_uuid(),
  location_name text not null unique,
  charge numeric(10, 2) not null check (charge >= 0),
  updated_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Upgrade support for earlier schema versions
alter table public.products add column if not exists status text not null default 'active';
alter table public.products add column if not exists seo_title text not null default '';
alter table public.products add column if not exists seo_description text not null default '';
alter table public.products add column if not exists product_highlights jsonb not null default '[]'::jsonb;
alter table public.product_images add column if not exists storage_path text;
alter table public.inventory add column if not exists created_at timestamptz not null default now();
alter table public.inventory add column if not exists updated_at timestamptz not null default now();
alter table public.orders add column if not exists updated_at timestamptz not null default now();

-- Seed default categories
insert into public.categories (name, slug, is_active)
values
  ('Unisex T-Shirts', 'unisex-t-shirts', true),
  ('Full Sleeve Shirts', 'full-sleeve-shirts', true),
  ('Oversized T-Shirts', 'oversized-t-shirts', true),
  ('Hoodies', 'hoodies', true),
  ('Polo Shirts', 'polo-shirts', true)
on conflict (name) do nothing;

-- Seed default shipping settings
insert into public.shipping_settings (location_name, charge)
values
  ('Sylhet', 70),
  ('Outside Sylhet', 120)
on conflict (location_name) do update
set charge = excluded.charge,
    updated_at = now();

-- Seed starter products
with tshirt_category as (
  select id from public.categories where slug = 'unisex-t-shirts' limit 1
), seed_products as (
  insert into public.products (
    category_id,
    name,
    slug,
    price,
    color,
    material,
    short_description,
    description,
    is_active,
    status,
    seo_title,
    seo_description,
    product_highlights
  )
  select
    tshirt_category.id,
    item.name,
    item.slug,
    item.price,
    item.color,
    item.material,
    item.short_description,
    item.description,
    true,
    'active',
    item.name || ' | Aurox',
    left(item.description, 160),
    item.highlights::jsonb
  from tshirt_category,
  (
    values
      (
        'Think Outside The Box T-Shirt',
        'think-outside-the-box-t-shirt',
        450,
        'Black',
        '100% Cotton',
        'A bold black cotton tee from the current Aurox drop.',
        'A bold black cotton tee designed for everyday confidence, featuring the Think Outside The Box graphic from the current Aurox drop.',
        '["Premium 100% cotton build","Unisex fit for versatile everyday wear","Statement Aurox graphic finish"]'
      ),
      (
        'Adventure T-Shirt',
        'adventure-t-shirt',
        450,
        'White',
        '100% Cotton',
        'A clean white cotton tee with an elevated everyday feel.',
        'A clean white cotton tee with the Adventure graphic, made for versatile everyday wear and an easy premium feel.',
        '["Premium 100% cotton build","Light, versatile styling","Clean front graphic placement"]'
      ),
      (
        'Wake Up Dreams T-Shirt',
        'wake-up-dreams-t-shirt',
        450,
        'Black',
        '100% Cotton',
        'A premium black tee with a bold statement graphic.',
        'A premium black cotton tee with the Wake Up Dreams statement graphic, built for minimal styling with a strong message.',
        '["Premium 100% cotton build","Minimal silhouette with strong message","Comfortable everyday fit"]'
      ),
      (
        'Think Chess T-Shirt',
        'think-chess-t-shirt',
        450,
        'White',
        '100% Cotton',
        'A sharp white tee balancing identity and everyday comfort.',
        'A white cotton tee featuring the Think Chess graphic, balancing sharp visual identity with premium everyday comfort.',
        '["Premium 100% cotton build","Balanced visual identity","Versatile unisex everyday wear"]'
      )
  ) as item(name, slug, price, color, material, short_description, description, highlights)
  where not exists (
    select 1 from public.products existing where existing.slug = item.slug
  )
  returning id, slug
)
insert into public.product_images (product_id, image_url, is_primary)
select
  p.id,
  case p.slug
    when 'think-outside-the-box-t-shirt' then 'images/product-1.svg'
    when 'adventure-t-shirt' then 'images/product-2.svg'
    when 'wake-up-dreams-t-shirt' then 'images/product-3.svg'
    when 'think-chess-t-shirt' then 'images/product-4.svg'
  end,
  true
from public.products p
where p.slug in (
  'think-outside-the-box-t-shirt',
  'adventure-t-shirt',
  'wake-up-dreams-t-shirt',
  'think-chess-t-shirt'
)
and not exists (
  select 1 from public.product_images pi
  where pi.product_id = p.id
    and pi.is_primary = true
);

insert into public.inventory (product_id, size, stock_quantity)
select p.id, s.size, s.stock_quantity
from public.products p
cross join (
  values ('M', 2), ('L', 2), ('XL', 1)
) as s(size, stock_quantity)
where p.slug in (
  'think-outside-the-box-t-shirt',
  'adventure-t-shirt',
  'wake-up-dreams-t-shirt',
  'think-chess-t-shirt'
)
on conflict (product_id, size) do update
set stock_quantity = excluded.stock_quantity,
    updated_at = now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_inventory_updated_at on public.inventory;
create trigger set_inventory_updated_at
before update on public.inventory
for each row
execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

drop trigger if exists set_shipping_settings_updated_at on public.shipping_settings;
create trigger set_shipping_settings_updated_at
before update on public.shipping_settings
for each row
execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.shipping_settings enable row level security;

drop policy if exists "Public can read active categories" on public.categories;
create policy "Public can read active categories"
on public.categories
for select
using (is_active = true or auth.role() = 'authenticated');

drop policy if exists "Authenticated admins manage categories" on public.categories;
create policy "Authenticated admins manage categories"
on public.categories
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products"
on public.products
for select
using ((is_active = true and status = 'active') or auth.role() = 'authenticated');

drop policy if exists "Authenticated admins manage products" on public.products;
create policy "Authenticated admins manage products"
on public.products
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Public can read product images" on public.product_images;
create policy "Public can read product images"
on public.product_images
for select
using (true);

drop policy if exists "Authenticated admins manage product images" on public.product_images;
create policy "Authenticated admins manage product images"
on public.product_images
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Public can read inventory" on public.inventory;
create policy "Public can read inventory"
on public.inventory
for select
using (true);

drop policy if exists "Authenticated admins manage inventory" on public.inventory;
create policy "Authenticated admins manage inventory"
on public.inventory
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Public can create orders" on public.orders;
create policy "Public can create orders"
on public.orders
for insert
to anon, authenticated
with check (true);

drop policy if exists "Authenticated admins manage orders" on public.orders;
create policy "Authenticated admins manage orders"
on public.orders
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Public can create order items" on public.order_items;
create policy "Public can create order items"
on public.order_items
for insert
to anon, authenticated
with check (true);

drop policy if exists "Authenticated admins manage order items" on public.order_items;
create policy "Authenticated admins manage order items"
on public.order_items
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Public can create payments" on public.payments;
create policy "Public can create payments"
on public.payments
for insert
to anon, authenticated
with check (true);

drop policy if exists "Authenticated admins manage payments" on public.payments;
create policy "Authenticated admins manage payments"
on public.payments
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Public can read shipping settings" on public.shipping_settings;
create policy "Public can read shipping settings"
on public.shipping_settings
for select
using (true);

drop policy if exists "Authenticated admins manage shipping settings" on public.shipping_settings;
create policy "Authenticated admins manage shipping settings"
on public.shipping_settings
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Public can view product images bucket" on storage.objects;
create policy "Public can view product images bucket"
on storage.objects
for select
using (bucket_id = 'product-images');

drop policy if exists "Authenticated admins upload product images bucket" on storage.objects;
create policy "Authenticated admins upload product images bucket"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'product-images');

drop policy if exists "Authenticated admins update product images bucket" on storage.objects;
create policy "Authenticated admins update product images bucket"
on storage.objects
for update
to authenticated
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');

drop policy if exists "Authenticated admins delete product images bucket" on storage.objects;
create policy "Authenticated admins delete product images bucket"
on storage.objects
for delete
to authenticated
using (bucket_id = 'product-images');

create or replace function public.track_orders(search_order_number text default null, search_phone text default null)
returns table (
  id uuid,
  order_number text,
  customer_name text,
  phone text,
  division text,
  delivery_location text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    o.id,
    o.order_number,
    o.customer_name,
    o.phone,
    o.division,
    o.delivery_location,
    o.status,
    o.created_at
  from public.orders o
  where
    (search_order_number is not null and o.order_number = search_order_number)
    or
    (search_phone is not null and o.phone = search_phone)
  order by o.created_at desc;
$$;

grant execute on function public.track_orders(text, text) to anon, authenticated;

create or replace function public.track_order_items(order_ids uuid[])
returns table (
  order_id uuid,
  product_name text,
  size text,
  quantity integer,
  price numeric
)
language sql
security definer
set search_path = public
as $$
  select
    oi.order_id,
    oi.product_name,
    oi.size,
    oi.quantity,
    oi.price
  from public.order_items oi
  where oi.order_id = any(order_ids);
$$;

grant execute on function public.track_order_items(uuid[]) to anon, authenticated;
