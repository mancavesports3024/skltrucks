#!/usr/bin/env bash
# Local non-production migration + RLS checks for market comparison.
# Simulates PostgREST role/JWT switching (anon | authenticated admins).
# Authenticated = same bar as inventory; anon denied; no UPDATE/DELETE.
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
MATRIX="/opt/cursor/artifacts/market_comparison_rls_matrix.txt"
mkdir -p /opt/cursor/artifacts
: > "$RESULTS"
: > "$MATRIX"

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

echo "==> Auth stubs (role/jwt/uid) + roles"
psql_file <<'SQL'
create schema if not exists auth;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.role() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
SQL

echo "==> Apply sourcing-schema prerequisites (is_sourcing_staff + authorized staff + leads)"
# Minimal equivalent of sourcing-schema pieces required by market-comparison.sql
psql_file <<'SQL'
create table if not exists public.sourcing_authorized_staff (
  email text primary key,
  display_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.sourcing_authorized_staff enable row level security;
drop policy if exists "Authenticated read sourcing staff directory"
  on public.sourcing_authorized_staff;
create policy "Authenticated read sourcing staff directory"
  on public.sourcing_authorized_staff for select
  using (auth.role() = 'authenticated');
grant select on public.sourcing_authorized_staff to authenticated;

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
drop policy if exists "Sourcing staff manage truck leads"
  on public.sourcing_truck_leads;
create policy "Sourcing staff manage truck leads"
  on public.sourcing_truck_leads for all
  using (public.is_sourcing_staff())
  with check (public.is_sourcing_staff());
grant select, insert, update, delete on public.sourcing_truck_leads to authenticated;
SQL

echo "==> Fail clearly when market-comparison applied without is_sourcing_staff (sanity on clean check)"
# Already installed — instead verify the DO block path by temporarily renaming
psql_file <<'SQL'
alter function public.is_sourcing_staff() rename to is_sourcing_staff_backup_rls;
SQL
if psql_file < "$ROOT/supabase/sourcing-market-comparison.sql" 2>"/tmp/mc-missing-dep.err"; then
  echo "FAIL expected missing is_sourcing_staff() to abort migration" | tee -a "$RESULTS"
  exit 1
fi
assert_missing="$(cat /tmp/mc-missing-dep.err)"
if [[ "$assert_missing" != *"is_sourcing_staff()"* ]]; then
  echo "FAIL missing-dep message unclear: $assert_missing" | tee -a "$RESULTS"
  exit 1
fi
echo "PASS migration_fails_without_is_sourcing_staff" | tee -a "$RESULTS"
psql_file <<'SQL'
alter function public.is_sourcing_staff_backup_rls() rename to is_sourcing_staff;
SQL

echo "==> Apply market comparison migration (first time)"
psql_file < "$ROOT/supabase/sourcing-market-comparison.sql"
echo "PASS migration_apply_1" | tee -a "$RESULTS"

echo "==> Re-apply market comparison migration (idempotency)"
psql_file < "$ROOT/supabase/sourcing-market-comparison.sql"
echo "PASS migration_apply_2_idempotent" | tee -a "$RESULTS"

# Seed identities
ACTIVE_UID="11111111-1111-1111-1111-111111111111"
INACTIVE_UID="22222222-2222-2222-2222-222222222222"
OUTSIDER_UID="33333333-3333-3333-3333-333333333333"
SPOOF_UID="99999999-9999-9999-9999-999999999999"

psql_q -c "insert into public.sourcing_authorized_staff (email, display_name, active) values
  ('active@skl.example', 'Active Staff', true),
  ('inactive@skl.example', 'Inactive Staff', false)
on conflict (email) do update set active = excluded.active;"

LEAD_ID="$(psql_q -c "insert into public.sourcing_truck_leads (year, make_model) values (2019, 'Freightliner M2') returning id;")"
echo "lead_id=$LEAD_ID" | tee -a "$RESULTS"

# Seed one comparison with JWT auth.uid set (trigger forces created_by from uid, rejecting spoof)
SEED_CMP="$(docker exec -i "$CONTAINER" psql -U postgres -d postgres -q -t -A <<SQL
select set_config('request.jwt.claim.sub','${ACTIVE_UID}',false);
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claims','{"email":"active@skl.example","sub":"${ACTIVE_UID}"}',false);
insert into public.sourcing_market_comparisons (lead_id, status, assessment, confidence, report, api_usage, error_message, created_by)
values ('${LEAD_ID}', 'completed', 'near_comparable_asking_market', 'medium', '{"ok":true}'::jsonb, '{"provider":"mock"}'::jsonb, null, '${SPOOF_UID}')
returning id;
SQL
)"
SEED_CMP="$(echo "$SEED_CMP" | tail -n1 | tr -d '[:space:]')"
echo "seed_comparison=$SEED_CMP" | tee -a "$RESULTS"
SEEDED_BY="$(psql_q -c "select created_by from public.sourcing_market_comparisons where id='${SEED_CMP}';")"
if [[ "$(echo "$SEEDED_BY" | tr -d '[:space:]')" != "$ACTIVE_UID" ]]; then
  echo "FAIL seed created_by forced from auth.uid expected=$ACTIVE_UID got=$SEEDED_BY" | tee -a "$RESULTS"
  exit 1
fi
echo "PASS seed_created_by_forced_from_auth_uid" | tee -a "$RESULTS"

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
  if [[ "$hay" == *ERROR* || "$hay" == *"permission denied"* || "$hay" == *"row-level security"* ]]; then
    echo "PASS $name" | tee -a "$RESULTS"
  else
    echo "FAIL $name expected_error got=$hay" | tee -a "$RESULTS"
    exit 1
  fi
}

matrix_row() {
  echo "$1" | tee -a "$MATRIX"
}

run_as_capture() {
  local role="$1" sub="$2" email="$3" sql="$4"
  local claims
  claims=$(printf '{"email":"%s","sub":"%s"}' "$email" "$sub")
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -q -t -A <<SQL
select set_config('request.jwt.claim.role','${role}',false);
select set_config('request.jwt.claim.sub','${sub}',false);
select set_config('request.jwt.claims','${claims}',false);
set role ${role};
${sql}
SQL
}

echo ""
echo "==> Four-identity access matrix (SELECT / INSERT / UPDATE / DELETE)"
echo "identity|SELECT|INSERT|UPDATE|DELETE" | tee -a "$MATRIX"

# --- anon ---
ANON_SEL="$(run_as_capture anon '' '' "select count(*)::text from public.sourcing_market_comparisons;" 2>&1 || true)"
ANON_INS="$(run_as_capture anon '' '' "insert into public.sourcing_market_comparisons (lead_id, status, created_by) values ('${LEAD_ID}','failed','${SPOOF_UID}') returning id;" 2>&1 || true)"
ANON_UPD="$(run_as_capture anon '' '' "update public.sourcing_market_comparisons set status='failed' where id='${SEED_CMP}' returning id;" 2>&1 || true)"
ANON_DEL="$(run_as_capture anon '' '' "delete from public.sourcing_market_comparisons where id='${SEED_CMP}' returning id;" 2>&1 || true)"
assert_fail "anon_select_denied" "$ANON_SEL"
assert_fail "anon_insert_denied" "$ANON_INS"
assert_fail "anon_update_denied" "$ANON_UPD"
assert_fail "anon_delete_denied" "$ANON_DEL"
matrix_row "anon|DENIED|DENIED|DENIED|DENIED"

# --- authenticated other admin (no directory row; same bar as inventory) ---
OUT_SEL="$(run_as_capture authenticated "$OUTSIDER_UID" "outsider@example.com" "select count(*)::text from public.sourcing_market_comparisons;" 2>&1 || true)"
OUT_SEL_N="$(echo "$OUT_SEL" | tail -n1 | tr -d '[:space:]')"
assert_eq "other_admin_select_count" "1" "$OUT_SEL_N"
OUT_INS="$(run_as_capture authenticated "$OUTSIDER_UID" "outsider@example.com" "insert into public.sourcing_market_comparisons (lead_id, status, created_by, error_message) values ('${LEAD_ID}','failed','${SPOOF_UID}','other') returning id;" 2>&1 || true)"
OUT_INS_ID="$(echo "$OUT_INS" | tail -n1 | tr -d '[:space:]')"
OUT_BY="$(psql_q -c "select created_by from public.sourcing_market_comparisons where id='${OUT_INS_ID}';")"
assert_eq "other_admin_insert_created_by" "$OUTSIDER_UID" "$OUT_BY"
OUT_UPD="$(run_as_capture authenticated "$OUTSIDER_UID" "outsider@example.com" "update public.sourcing_market_comparisons set status='failed' where id='${SEED_CMP}' returning id;" 2>&1 || true)"
assert_fail "other_admin_update_denied" "$OUT_UPD"
OUT_DEL="$(run_as_capture authenticated "$OUTSIDER_UID" "outsider@example.com" "delete from public.sourcing_market_comparisons where id='${SEED_CMP}' returning id;" 2>&1 || true)"
if [[ "$OUT_DEL" == *ERROR* || "$OUT_DEL" == *"permission denied"* ]]; then
  echo "PASS other_admin_delete_denied" | tee -a "$RESULTS"
else
  OUT_LEFT="$(psql_q -c "select count(*)::text from public.sourcing_market_comparisons where id='${SEED_CMP}';")"
  assert_eq "other_admin_delete_no_effect" "1" "$OUT_LEFT"
fi
matrix_row "authenticated_other_admin|OK|OK_INSERT|DENIED|DENIED"

# --- inactive directory row still authenticated → allowed (directory optional) ---
IN_SEL="$(run_as_capture authenticated "$INACTIVE_UID" "inactive@skl.example" "select count(*)::text from public.sourcing_market_comparisons where lead_id='${LEAD_ID}';" 2>&1 || true)"
IN_SEL_N="$(echo "$IN_SEL" | tail -n1 | tr -d '[:space:]')"
assert_eq "inactive_dir_select_count" "2" "$IN_SEL_N"
IN_INS="$(run_as_capture authenticated "$INACTIVE_UID" "inactive@skl.example" "insert into public.sourcing_market_comparisons (lead_id, status, created_by, error_message) values ('${LEAD_ID}','failed','${SPOOF_UID}','inactive-dir') returning id;" 2>&1 || true)"
IN_INS_ID="$(echo "$IN_INS" | tail -n1 | tr -d '[:space:]')"
IN_BY="$(psql_q -c "select created_by from public.sourcing_market_comparisons where id='${IN_INS_ID}';")"
assert_eq "inactive_dir_insert_created_by" "$INACTIVE_UID" "$IN_BY"
IN_UPD="$(run_as_capture authenticated "$INACTIVE_UID" "inactive@skl.example" "update public.sourcing_market_comparisons set status='failed' where id='${SEED_CMP}' returning id;" 2>&1 || true)"
assert_fail "inactive_dir_update_denied" "$IN_UPD"
IN_DEL="$(run_as_capture authenticated "$INACTIVE_UID" "inactive@skl.example" "delete from public.sourcing_market_comparisons where id='${SEED_CMP}' returning id;" 2>&1 || true)"
if [[ "$IN_DEL" == *ERROR* || "$IN_DEL" == *"permission denied"* ]]; then
  echo "PASS inactive_dir_delete_denied" | tee -a "$RESULTS"
else
  IN_LEFT="$(psql_q -c "select count(*)::text from public.sourcing_market_comparisons where id='${SEED_CMP}';")"
  assert_eq "inactive_dir_delete_no_effect" "1" "$IN_LEFT"
fi
matrix_row "authenticated_inactive_directory|OK|OK_INSERT|DENIED|DENIED"

# --- active authorized staff ---
ACT_SEL="$(run_as_capture authenticated "$ACTIVE_UID" "active@skl.example" "select count(*)::text from public.sourcing_market_comparisons where lead_id='${LEAD_ID}';" | tail -n1)"
assert_eq "active_select_count" "3" "$ACT_SEL"

ACT_INS_ID="$(run_as_capture authenticated "$ACTIVE_UID" "active@skl.example" "insert into public.sourcing_market_comparisons (lead_id, status, assessment, confidence, report, api_usage, error_message, created_by) values ('${LEAD_ID}','failed',null,null,null,'{\"provider\":\"mock\"}'::jsonb,'Provider failure: test','${SPOOF_UID}') returning id;" | tail -n1 | tr -d '[:space:]')"
ACT_BY="$(psql_q -c "select created_by from public.sourcing_market_comparisons where id='${ACT_INS_ID}';")"
assert_eq "active_insert_created_by_is_auth_uid_not_spoof" "$ACTIVE_UID" "$ACT_BY"
# Explicit spoof attempt already done above — created_by must not equal SPOOF_UID
if [[ "$(echo "$ACT_BY" | tr -d '[:space:]')" == "$SPOOF_UID" ]]; then
  echo "FAIL spoofed_created_by_accepted" | tee -a "$RESULTS"
  exit 1
fi
echo "PASS spoofed_created_by_rejected" | tee -a "$RESULTS"

ACT_UPD="$(run_as_capture authenticated "$ACTIVE_UID" "active@skl.example" "update public.sourcing_market_comparisons set status='completed' where id='${SEED_CMP}' returning id;" 2>&1 || true)"
assert_fail "active_update_denied" "$ACT_UPD"
ACT_DEL="$(run_as_capture authenticated "$ACTIVE_UID" "active@skl.example" "delete from public.sourcing_market_comparisons where id='${SEED_CMP}' returning id;" 2>&1 || true)"
if [[ "$ACT_DEL" == *ERROR* || "$ACT_DEL" == *"permission denied"* ]]; then
  echo "PASS active_delete_denied" | tee -a "$RESULTS"
else
  ACT_LEFT="$(psql_q -c "select count(*)::text from public.sourcing_market_comparisons where id='${SEED_CMP}';")"
  assert_eq "active_delete_no_effect" "1" "$ACT_LEFT"
fi
matrix_row "authenticated_active_staff|OK|OK_INSERT|DENIED|DENIED"

echo "==> FK + cascade"
FK="$(run_as_capture authenticated "$ACTIVE_UID" "active@skl.example" "insert into public.sourcing_market_comparisons (lead_id, status, created_by) values ('00000000-0000-0000-0000-000000000099','failed','${ACTIVE_UID}') returning id;" 2>&1 || true)"
assert_fail "fk_nonexistent_lead" "$FK"

BEFORE_CASCADE="$(psql_q -c "select count(*)::text from public.sourcing_market_comparisons where lead_id='${LEAD_ID}';")"
psql_q -c "delete from public.sourcing_truck_leads where id='${LEAD_ID}';" >/dev/null
AFTER_CASCADE="$(psql_q -c "select count(*)::text from public.sourcing_market_comparisons where lead_id='${LEAD_ID}';")"
assert_eq "cascade_on_lead_delete" "0" "$AFTER_CASCADE"
echo "NOTE cascade_delete: deleting sourcing_truck_leads row removes ${BEFORE_CASCADE} comparison(s)" | tee -a "$RESULTS"

# Policy listing
POLICIES="$(psql_q -c "select policyname||':'||cmd from pg_policies where tablename='sourcing_market_comparisons' order by policyname;")"
echo "POLICIES:$POLICIES" | tee -a "$RESULTS"

echo "==> All local migration/RLS checks passed"
echo "---- RESULTS ----"
cat "$RESULTS"
echo "---- MATRIX ----"
cat "$MATRIX"
