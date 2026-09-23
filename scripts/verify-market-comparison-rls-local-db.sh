#!/usr/bin/env bash
# Production-shaped RLS checks against the local sb_db (app-connected Postgres).
# Does not touch cloud production. Cleans up all test rows.
set -euo pipefail

export PGPASSWORD=postgres
PSQL=(psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -t -A)
RESULTS=/opt/cursor/artifacts/market_comparison_local_prodshaped_rls.txt
: > "$RESULTS"

leads_before="$("${PSQL[@]}" -c "select count(*) from public.sourcing_truck_leads;")"
echo "leads_before=$leads_before" | tee -a "$RESULTS"

ACTIVE_UID=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
INACTIVE_UID=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
OUTSIDER_UID=cccccccc-cccc-cccc-cccc-cccccccccccc
SPOOF_UID=99999999-9999-9999-9999-999999999999

# Ensure staff directory rows for this check (restore primary after)
"${PSQL[@]}" -c "insert into public.sourcing_authorized_staff(email,display_name,active) values
  ('active-rls@skl.example','Active RLS',true),
  ('inactive-rls@skl.example','Inactive RLS',false)
on conflict (email) do update set active=excluded.active;"

LEAD="$("${PSQL[@]}" -c "insert into public.sourcing_truck_leads(year,make_model,source_url,canonical_listing_url)
  values (2019,'Freightliner M2','https://example.com/rls-check','https://example.com/rls-check-'||gen_random_uuid()::text)
  returning id;")"

run_as() {
  local role="$1" sub="$2" email="$3" sql="$4"
  local claims
  claims=$(printf '{"email":"%s","sub":"%s"}' "$email" "$sub")
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -q -t -A <<SQL
select set_config('request.jwt.claim.role','${role}',false);
select set_config('request.jwt.claim.sub','${sub}',false);
select set_config('request.jwt.claims','${claims}',false);
set role ${role};
${sql}
SQL
}

assert_fail() {
  local name="$1" hay="$2"
  if [[ "$hay" == *ERROR* || "$hay" == *"permission denied"* || "$hay" == *"row-level security"* ]]; then
    echo "PASS $name" | tee -a "$RESULTS"
  else
    echo "FAIL $name got=$hay" | tee -a "$RESULTS"
    exit 1
  fi
}

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

# Seed as active (forces created_by)
SEED=$(psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -q -t -A <<SQL
select set_config('request.jwt.claim.sub','${ACTIVE_UID}',false);
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claims','{"email":"active-rls@skl.example","sub":"${ACTIVE_UID}"}',false);
insert into public.sourcing_market_comparisons(lead_id,status,created_by,error_message)
values ('${LEAD}','failed','${SPOOF_UID}','seed') returning id;
SQL
)
SEED=$(echo "$SEED" | tail -n1 | tr -d '[:space:]')
CB=$("${PSQL[@]}" -c "select created_by from public.sourcing_market_comparisons where id='${SEED}';")
assert_eq "spoof_replaced_by_auth_uid" "$ACTIVE_UID" "$CB"

# Grant authenticated/anon roles if missing (supabase local usually has them)
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -q <<'SQL' >/dev/null
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated;
grant execute on function public.is_sourcing_staff() to anon, authenticated;
grant execute on function public.can_manage_sourcing_market_comparisons() to anon, authenticated;
grant select, insert on public.sourcing_market_comparisons to authenticated;
revoke all on public.sourcing_market_comparisons from anon;
SQL

ANON_SEL=$(run_as anon '' '' "select count(*)::text from public.sourcing_market_comparisons;" 2>&1 || true)
assert_fail "anon_select" "$ANON_SEL"
ANON_INS=$(run_as anon '' '' "insert into public.sourcing_market_comparisons(lead_id,status,created_by) values('${LEAD}','failed','x') returning id;" 2>&1 || true)
assert_fail "anon_insert" "$ANON_INS"

OUT_SEL=$(run_as authenticated "$OUTSIDER_UID" "outsider@example.com" "select count(*)::text from public.sourcing_market_comparisons;" 2>&1 || true)
OUT_N=$(echo "$OUT_SEL" | tail -n1 | tr -d '[:space:]')
assert_eq "outsider_select_empty" "0" "$OUT_N"
OUT_INS=$(run_as authenticated "$OUTSIDER_UID" "outsider@example.com" "insert into public.sourcing_market_comparisons(lead_id,status,created_by) values('${LEAD}','failed','${SPOOF_UID}') returning id;" 2>&1 || true)
assert_fail "outsider_insert" "$OUT_INS"

IN_SEL=$(run_as authenticated "$INACTIVE_UID" "inactive-rls@skl.example" "select count(*)::text from public.sourcing_market_comparisons;" 2>&1 || true)
IN_N=$(echo "$IN_SEL" | tail -n1 | tr -d '[:space:]')
assert_eq "inactive_select_empty" "0" "$IN_N"
IN_INS=$(run_as authenticated "$INACTIVE_UID" "inactive-rls@skl.example" "insert into public.sourcing_market_comparisons(lead_id,status,created_by) values('${LEAD}','failed','${SPOOF_UID}') returning id;" 2>&1 || true)
assert_fail "inactive_insert" "$IN_INS"

ACT_SEL=$(run_as authenticated "$ACTIVE_UID" "active-rls@skl.example" "select count(*)::text from public.sourcing_market_comparisons where lead_id='${LEAD}';" | tail -n1)
assert_eq "active_select" "1" "$ACT_SEL"
ACT_INS=$(run_as authenticated "$ACTIVE_UID" "active-rls@skl.example" "insert into public.sourcing_market_comparisons(lead_id,status,created_by,error_message) values('${LEAD}','failed','${SPOOF_UID}','temp') returning id;" | tail -n1 | tr -d '[:space:]')
ACT_CB=$("${PSQL[@]}" -c "select created_by from public.sourcing_market_comparisons where id='${ACT_INS}';")
assert_eq "active_insert_created_by" "$ACTIVE_UID" "$ACT_CB"

ACT_UPD=$(run_as authenticated "$ACTIVE_UID" "active-rls@skl.example" "update public.sourcing_market_comparisons set status='completed' where id='${SEED}' returning id;" 2>&1 || true)
assert_fail "active_update" "$ACT_UPD"
ACT_DEL=$(run_as authenticated "$ACTIVE_UID" "active-rls@skl.example" "delete from public.sourcing_market_comparisons where id='${SEED}' returning id;" 2>&1 || true)
if [[ "$ACT_DEL" == *ERROR* || "$ACT_DEL" == *"permission denied"* ]]; then
  echo "PASS active_delete" | tee -a "$RESULTS"
else
  LEFT=$("${PSQL[@]}" -c "select count(*) from public.sourcing_market_comparisons where id='${SEED}';")
  assert_eq "active_delete_no_effect" "1" "$LEFT"
fi

# Cleanup — no test records remain
"${PSQL[@]}" -c "delete from public.sourcing_market_comparisons where lead_id='${LEAD}';"
"${PSQL[@]}" -c "delete from public.sourcing_truck_leads where id='${LEAD}';"
"${PSQL[@]}" -c "delete from public.sourcing_authorized_staff where email in ('active-rls@skl.example','inactive-rls@skl.example');"

leads_after="$("${PSQL[@]}" -c "select count(*) from public.sourcing_truck_leads;")"
cmp_left="$("${PSQL[@]}" -c "select count(*) from public.sourcing_market_comparisons;")"
assert_eq "leads_unchanged" "$leads_before" "$leads_after"
assert_eq "no_test_comparisons_left" "0" "$cmp_left"

echo "MATRIX anon=DENIED/DENIED/DENIED/DENIED" | tee -a "$RESULTS"
echo "MATRIX outsider=0/DENIED/DENIED/DENIED" | tee -a "$RESULTS"
echo "MATRIX inactive=0/DENIED/DENIED/DENIED" | tee -a "$RESULTS"
echo "MATRIX active=OK/OK/DENIED/DENIED" | tee -a "$RESULTS"
echo "All local prod-shaped RLS checks passed; no test records remain."
cat "$RESULTS"
