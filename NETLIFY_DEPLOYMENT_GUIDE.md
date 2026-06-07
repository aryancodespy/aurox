# Aurox Netlify + Supabase Deployment Guide

This guide explains how to deploy the static Aurox storefront with Supabase.

## 1. Supabase Setup

### Create The Database

1. Open your Supabase project.
2. Go to `SQL Editor`.
3. Run [supabase-schema.sql](./supabase-schema.sql).

This creates:
- categories
- admin_users
- products
- product_images
- inventory
- orders
- order_items
- payments
- shipping_settings
- admin_logs

### Create The Storage Bucket

1. Open `Storage`.
2. Create a bucket named `product-images`.
3. Keep it public.

The SQL file also includes storage policies for authenticated admins.

### Create Admin Login

1. Go to `Authentication` -> `Users`.
2. Invite your first admin email.
3. Follow [ADMIN_SETUP_GUIDE.md](./ADMIN_SETUP_GUIDE.md) to add that user into `public.admin_users`.

## 2. Frontend Config

The site uses:
- `HTML`
- `CSS`
- `JavaScript`
- Supabase browser client

Supabase config lives in:
- [js/supabase-config.js](./js/supabase-config.js)

Current values needed:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_STORAGE_BUCKET`

## 3. Environment Variables

Because this is a static site, the Supabase anon key is safe to use in frontend code.
It is a public key, not the service role key.

You have two beginner-friendly options:

### Option A. Keep The Public Config In `js/supabase-config.js`

This is the simplest for a static Netlify site.

### Option B. Inject Public Config During Build

If you later add a build step, you can use Netlify environment variables for:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_STORAGE_BUCKET`

For the current project, Option A is the easiest because there is no framework build pipeline.

## 4. Netlify Deployment Steps

1. Push the Aurox project to GitHub.
2. Open Netlify.
3. Click `Add new site`.
4. Import the repository.
5. Because this is a static site:
   - Build command: leave empty
   - Publish directory: `/`
6. Deploy the site.

## 5. Netlify Form Notifications

Checkout still includes a hidden Netlify form for best-effort order notification.

After deploy:
1. Place a test order.
2. Check Netlify Forms.
3. Confirm the `aurox-orders` form appears.

Primary business records still live in Supabase.

## 6. Test Checklist After Deploy

### Public Site

- Home page loads
- Featured products load from Supabase
- Shop search and filters work
- Product modal opens
- Size guide works
- Cart works
- Checkout saves order to Supabase
- Payment submission saves to Supabase
- Track order works

### Admin

- Admin login works
- Non-admin users are blocked
- Category create/edit works
- Product create/edit works
- Featured toggle works
- Product badges show publicly
- Image uploads work
- Inventory updates work
- Order status updates work
- Payment verification works
- Shipping settings update checkout
- Audit log entries appear

## 7. Important Security Notes

- Never place the Supabase service role key in frontend code
- Use only the anon key in the browser
- Protect admin access through Supabase Auth + `public.admin_users`
- Let RLS handle database security
