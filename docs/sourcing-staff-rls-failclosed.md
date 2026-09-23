# Sourcing authorization = inventory Admin

## Verified inventory Admin rule

| Layer | Rule |
|-------|------|
| Middleware (`src/lib/supabase/middleware.ts`) | `supabase.auth.getUser()` must return a user for `/admin` (except login) |
| Inventory server actions / `/api/admin` | Signed-in user (middleware + session client); products writes rely on RLS |
| Products RLS (`supabase/schema.sql`) | `auth.role() = 'authenticated'` for full access; anon reads published only |
| Email allowlist / role claim / staff table | **None** for inventory Admin |

**Conclusion:** Admin = any authenticated Supabase Auth user. There is no narrower inventory staff list.

## Shared sourcing rule

`Can access inventory Admin` ⇔ `Can access Sourcing`

- App: `requireAdmin()` / `requireSourcingStaff()` (alias) — identical decision
- SQL: `public.is_sourcing_staff()` = `auth.role() = 'authenticated'`
- `SOURCING_STAFF_EMAILS`: **unused** (not part of Admin rule)
- `sourcing_authorized_staff`: **retained, unused for authorization** (do not drop/delete)

**Accepted implication:** every authenticated Supabase account can access private sourcing data via app and via direct PostgREST/RLS (same as inventory). Anonymous remains denied.

## Production SQL (human)

Apply `supabase/sourcing-rls-admin-aligned.sql` **before** merge/deploy if production still has the fail-closed directory check:

1. Review app + SQL
2. Apply SQL to production
3. Confirm signed-in inventory admin can open `/admin/sourcing`
4. Merge/deploy app
5. Reconfirm signed-out denial + signed-in Admin access

Do not auto-apply from CI. Do not re-import Penske until recovery is confirmed.
