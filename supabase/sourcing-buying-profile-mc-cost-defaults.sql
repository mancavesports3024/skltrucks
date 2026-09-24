-- DEPRECATED filename.
-- Required migration is now:
--   supabase/sourcing-mc-driving-distance-required.sql
-- That file includes:
--   - transportation_rate_per_mile / default_inspection_cost columns
--   - merge_sourcing_lead_driving_route() atomic JSONB merge RPC
-- Apply that file (idempotent) before deploying the application.
-- This stub intentionally does nothing so accidental re-runs of the old path are harmless.
select 1;
