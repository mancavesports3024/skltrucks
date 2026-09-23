-- DEPRECATED. Do not apply.
-- Superseded by supabase/sourcing-rls-admin-aligned.sql
--
-- Business rule (current): Can access inventory Admin = Can access Sourcing =
-- any authenticated Supabase Auth user (same as products RLS).
-- The prior fail-closed directory-only is_sourcing_staff() locked out existing
-- inventory admins who were not listed in sourcing_authorized_staff.

select 'Use supabase/sourcing-rls-admin-aligned.sql instead'::text as notice;
