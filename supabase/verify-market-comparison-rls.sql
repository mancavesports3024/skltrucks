-- Local non-production RLS verification for sourcing_market_comparisons.
-- Run against a throwaway Postgres with auth stubs (see scripts/verify-market-comparison-rls.sh).
-- Does NOT touch production.

-- Expectation summary (asserted by the shell script):
-- 1. anon cannot select/insert
-- 2. authenticated outsider (is_sourcing_staff false in our stub) cannot select/insert
-- 3. active sourcing staff can select/insert
-- 4. insert with nonexistent lead_id fails FK
-- 5. deleting a lead cascades comparisons
-- 6. created_by is forced from JWT email (spoof ignored when JWT present)
-- 7. failed rows store status=failed, report null, error_message set
-- 8. no raw provider blob column exists

select 'rls_harness_loaded' as status;
