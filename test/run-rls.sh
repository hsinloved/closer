#!/usr/bin/env bash
# Runs the row-level security checks on a throwaway database. Needs psql and a Postgres to talk to:
#   PGHOST=... PGPORT=... PGUSER=postgres test/run-rls.sh
set -euo pipefail
cd "$(dirname "$0")/.."
db="closer_rls_$$"
psql -q -c "create database $db" >/dev/null
trap 'psql -q -c "drop database if exists $db" >/dev/null' EXIT
psql -d "$db" -v ON_ERROR_STOP=1 -q -f test/supabase-stub.sql -f supabase/migrations/0001_closer.sql -f test/rls.sql 2>&1 | sed -n 's/.*NOTICE:  //p; /PASSED/p; /ERROR/p'
