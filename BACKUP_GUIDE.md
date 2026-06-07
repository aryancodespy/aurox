# Aurox Backup Guide

This guide explains simple ways to export products, orders, and inventory from Supabase for regular business backups.

## Option 1. Export From Table Editor

For beginners, this is the easiest method.

1. Open Supabase.
2. Go to `Table Editor`.
3. Open one of these tables:
   - `products`
   - `inventory`
   - `orders`
   - `order_items`
   - `payments`
4. Use the export option to download CSV.

Recommended exports:
- `products`
- `product_images`
- `inventory`
- `orders`
- `order_items`
- `payments`

## Option 2. Export With SQL

Use the `SQL Editor` when you want clean filtered backup views.

### Export Products

```sql
select
  p.id,
  p.name,
  p.slug,
  c.name as category,
  p.price,
  p.color,
  p.material,
  p.status,
  p.is_featured,
  p.badges,
  p.seo_title,
  p.seo_description,
  p.created_at
from public.products p
left join public.categories c on c.id = p.category_id
order by p.created_at desc;
```

### Export Inventory

```sql
select
  p.name as product_name,
  i.size,
  i.stock_quantity,
  i.updated_at
from public.inventory i
join public.products p on p.id = i.product_id
order by p.name, i.size;
```

### Export Orders

```sql
select
  o.order_number,
  o.customer_name,
  o.phone,
  o.address,
  o.division,
  o.delivery_location,
  o.order_notes,
  o.product_total,
  o.delivery_charge,
  o.amount_to_pay_now,
  o.amount_to_pay_on_delivery,
  o.status,
  o.created_at
from public.orders o
order by o.created_at desc;
```

### Export Order Items

```sql
select
  o.order_number,
  oi.product_name,
  oi.size,
  oi.quantity,
  oi.price
from public.order_items oi
join public.orders o on o.id = oi.order_id
order by o.created_at desc;
```

## Option 3. Full Database Backup

For larger business safety:

1. Go to Supabase project settings.
2. Use backup tools available on your Supabase plan.
3. Keep a monthly full backup plus weekly CSV exports.

## Recommended Backup Schedule

- Daily: `orders`, `order_items`, `payments`
- Weekly: `products`, `product_images`, `inventory`
- Monthly: full project backup

## What To Store Together

Keep these exports in the same dated folder:
- `products.csv`
- `product_images.csv`
- `inventory.csv`
- `orders.csv`
- `order_items.csv`
- `payments.csv`

That makes it easier to restore business data later.
