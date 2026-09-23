-- DEPRECATED for authorization widening.
-- Do NOT re-apply this file to restore inventory-aligned (any authenticated) access.
-- Private sourcing now requires supabase/sourcing-staff-rls-failclosed.sql:
--   is_sourcing_staff() ⇒ active sourcing_authorized_staff row + JWT email + auth.uid().
--
-- This file previously set can_manage_sourcing_market_comparisons() = is_sourcing_staff()
-- when is_sourcing_staff() meant "any authenticated user". That combination is unsafe
-- for private inspection URLs. Keep this file only as historical reference; the
-- fail-closed hotfix recreates can_manage_sourcing_market_comparisons() correctly.

select 'Use supabase/sourcing-staff-rls-failclosed.sql instead'::text as notice;
