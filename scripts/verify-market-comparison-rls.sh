#!/usr/bin/env bash
# Local non-production migration + RLS checks for market comparison.
# Spins up ephemeral Postgres, applies additive migration, verifies policies.
# Never touches production.
set -euo pipefail

docker() {
  command sudo docker "$@"
}

CONTAINER="skl-mc-rls-$$"
PORT="${MC_RLS_PORT:-55432}"
IMAGE="${MC_RLS_IMAGE:-postgres:16-alpine}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RESULTS="/opt/cursor/artifacts/market_comparison_rls_results.txt"
mkdir -p /opt/cursor/artifacts
: > "$RESULTS"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Starting ephemeral Postgres on :$PORT"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=postgres \
  -p "$PORT:5432" \
  "$IMAGE" >/dev/null

for _ in $(seq 1 40); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres >/dev/null

psql_q() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q -t -A "$@"
}

psql_file() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q "$@"
}

echo "==> Installing auth stubs + roles"
psql_file <<'SQL'
create schema if not exists auth;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.role() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
SQL

echo "==> Minimal lead table + production is_sourcing_staff() (any authenticated)"
psql_file <<'SQL'
create or replace function public.is_sourcing_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role() = 'authenticated', false);
$$;
revoke all on function public.is_sourcing_staff() from public;
grant execute on function public.is_sourcing_staff() to authenticated;
grant execute on function public.is_sourcing_staff() to anon;

create table if not exists public.sourcing_truck_leads (
  id uuid primary key default gen_random_uuid(),
  year integer,
  make_model text not null default '',
  created_at timestamptz not null default now()
);
alter table public.sourcing_truck_leads enable row level security;
SQL

echo "==> Applying market comparison migration"
psql_file < "$ROOT/supabase/sourcing-market-comparison.sql"

LEAD_ID="$(psql_q -c "insert into public.sourcing_truck_leads (year, make_model) values (2019, 'Freightliner M2') returning id;")"
echo "lead_id=$LEAD_ID" | tee -a "$RESULTS"

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  actual="$(echo "$actual" | tr -d '[:space:]')"
  if [[ "$actual" == "$expected" ]]; then
    echo "PASS $name" | tee -a "$RESULTS"
  else
    echo "FAIL $name expected=$expected actual=$actual" | tee -a "$RESULTS"
    exit 1
  fi
}

assert_fail() {
  local name="$1" hay="$2"
  if [[ "$hay" == *ERROR* || "$hay" == *"permission denied"* ]]; then
    echo "PASS $name" | tee -a "$RESULTS"
  else
    echo "FAIL $name expected_error got=$hay" | tee -a "$RESULTS"
    exit 1
  fi
}

assert_contains() {
  local name="$1" needle="$2" hay="$3"
  if [[ "$hay" == *"$needle"* ]]; then
    echo "PASS $name" | tee -a "$RESULTS"
  else
    echo "FAIL $name missing=$needle got=$hay" | tee -a "$RESULTS"
    exit 1
  fi
}

run_as() {
  local role="$1" claims="$2" sql="$3"
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -q -t -A -v ON_ERROR_STOP=1 <<SQL
select set_config('request.jwt.claim.role','${role}',false);
select set_config('request.jwt.claims','${claims}',false);
set role ${role};
${sql}
SQL
}

run_as_capture_err() {
  local role="$1" claims="$2" sql="$3"
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -q -t -A <<SQL
select set_config('request.jwt.claim.role','${role}',false);
select set_config('request.jwt.claims','${claims}',false);
set role ${role};
${sql}
SQL
}

echo "==> anon cannot select (no grant / RLS)"
ANON_SEL="$(run_as_capture_err anon '{}' "select count(*)::text from public.sourcing_market_comparisons;" 2>&1 || true)"
assert_fail "anon_select_denied" "$ANON_SEL"

echo "==> anon cannot insert"
ANON_INS="$(run_as_capture_err anon '{}' "insert into public.sourcing_market_comparisons (lead_id, status, created_by) values ('${LEAD_ID}','failed','spoof@x.com') returning id;" 2>&1 || true)"
assert_fail "anon_insert_denied" "$ANON_INS"

echo "NOTE production RLS: any authenticated user passes is_sourcing_staff(); app requireSourcingStaff() is the outsider gate" | tee -a "$RESULTS"

echo "==> authenticated staff can insert; created_by forced from JWT"
STAFF_ID="$(run_as authenticated '{"email":"staff@skl.example"}' "insert into public.sourcing_market_comparisons (lead_id, status, assessment, confidence, report, api_usage, error_message, created_by) values ('${LEAD_ID}','completed','near_comparable_asking_market','medium','{\"ok\":true}'::jsonb,'{\"provider\":\"mock\"}'::jsonb,null,'spoofed@evil.com') returning id;" | tail -n1 | tr -d '[:space:]')"
CREATED_BY="$(psql_q -c "select created_by from public.sourcing_market_comparisons where id='${STAFF_ID}';")"
assert_eq "created_by_from_jwt" "staff@skl.example" "$CREATED_BY"

FAIL_ID="$(run_as authenticated '{"email":"staff@skl.example"}' "insert into public.sourcing_market_comparisons (lead_id, status, assessment, confidence, report, api_usage, error_message, created_by) values ('${LEAD_ID}','failed',null,null,null,'{\"provider\":\"openai\",\"estimatedCostUsd\":0.01}'::jsonb,'Provider failure: invalid structured output','ignored') returning id;" | tail -n1 | tr -d '[:space:]')"
FAIL_ROW="$(psql_q -c "select status||'|'||coalesce(report::text,'null')||'|'||coalesce(error_message,'') from public.sourcing_market_comparisons where id='${FAIL_ID}';")"
assert_contains "failed_row_shape" "failed|null|Provider failure" "$FAIL_ROW"

STAFF_CNT="$(run_as authenticated '{"email":"staff@skl.example"}' "select count(*)::text from public.sourcing_market_comparisons;" | tail -n1)"
assert_eq "staff_select_count" "2" "$STAFF_CNT"

echo "==> nonexistent lead FK rejected"
FK="$(run_as_capture_err authenticated '{"email":"staff@skl.example"}' "insert into public.sourcing_market_comparisons (lead_id, status, created_by) values ('00000000-0000-0000-0000-000000000099','failed','staff@skl.example') returning id;" 2>&1 || true)"
assert_fail "fk_nonexistent_lead" "$FK"

echo "==> delete lead cascades comparisons"
psql_q -c "delete from public.sourcing_truck_leads where id='${LEAD_ID}';" >/dev/null
LEFT="$(psql_q -c "select count(*)::text from public.sourcing_market_comparisons where lead_id='${LEAD_ID}';")"
assert_eq "cascade_on_lead_delete" "0" "$LEFT"

COLS="$(psql_q -c "select string_agg(column_name, ',') from information_schema.columns where table_schema='public' and table_name='sourcing_market_comparisons';")"
assert_contains "has_report_json" "report" "$COLS"
assert_contains "has_api_usage" "api_usage" "$COLS"
if [[ "$COLS" == *raw_model* || "$COLS" == *raw_output* || "$COLS" == *secret* ]]; then
  echo "FAIL unexpected_secret_column $COLS" | tee -a "$RESULTS"
  exit 1
fi
echo "PASS no_raw_provider_column" | tee -a "$RESULTS"
echo "NOTE app_layer_outsider_gate=requireSourcingStaff" | tee -a "$RESULTS"

echo "==> All local migration/RLS checks passed"
cat "$RESULTS"
