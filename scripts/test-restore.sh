#!/bin/sh
# Restore only into a disposable, separately provisioned database.
set -eu
: "${RESTORE_TEST_DATABASE_URL:?A disposable RESTORE_TEST_DATABASE_URL is required}"
: "${1:?Provide a backup file}"
if [ "${CONFIRM_DISPOSABLE_RESTORE:-}" != 'yes' ]; then echo 'Set CONFIRM_DISPOSABLE_RESTORE=yes after verifying the target is disposable' >&2; exit 1; fi
pg_restore --dbname="$RESTORE_TEST_DATABASE_URL" --no-owner --no-privileges --single-transaction --exit-on-error "$1"
psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS indexed_transactions FROM transactions;'
