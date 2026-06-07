# Aurox Admin Setup Guide

This guide explains how to create the first admin account, invite future admins, and remove admin access safely.

## 1. Create The First Admin Account

1. Open your Supabase project.
2. Go to `Authentication` -> `Users`.
3. Click `Invite user`.
4. Enter `business.aryanahmed@gmail.com`.
5. Send the invite and complete the password setup from the email.
6. Open the `SQL Editor`.
7. Run this SQL after the user account exists:

```sql
insert into public.admin_users (id, role, is_active)
select id, 'admin', true
from auth.users
where email = 'business.aryanahmed@gmail.com'
on conflict (id) do update
set role = excluded.role,
    is_active = excluded.is_active;
```

This connects the authenticated Supabase user to the Aurox admin role system.

## 2. How Admin Access Works

- Admin emails are not hardcoded in frontend code.
- The website checks `public.admin_users` after login.
- Only users in `public.admin_users` with `is_active = true` can open `aura-control.html`.
- Row Level Security also uses this role check.

## 3. Invite Future Admin Accounts

1. Go to `Authentication` -> `Users`.
2. Invite the new user by email.
3. After they accept the invite, run:

```sql
insert into public.admin_users (id, role, is_active)
select id, 'manager', true
from auth.users
where email = 'new-admin@example.com'
on conflict (id) do update
set role = excluded.role,
    is_active = excluded.is_active;
```

You can use:
- `'admin'` for full business control
- `'manager'` for store team access

## 4. Remove Admin Access

To disable an admin without deleting their Supabase Auth account:

```sql
update public.admin_users
set is_active = false
where id = (
  select id from auth.users where email = 'old-admin@example.com'
);
```

To remove the admin role row completely:

```sql
delete from public.admin_users
where id = (
  select id from auth.users where email = 'old-admin@example.com'
);
```

## 5. Remove The User Completely

If you want to remove the full login account too:

1. Go to `Authentication` -> `Users`
2. Delete the user from the Supabase dashboard

Do this only if you want to remove both:
- login access
- admin role access

## 6. Recommended Habit

- Keep one primary owner account as `admin`
- Give team members `manager` unless they need full control
- Disable access with `is_active = false` instead of deleting immediately
