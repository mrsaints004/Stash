#!/bin/sh
# Usage: BACKUP_DATABASE_URL=... ./scripts/backup-database.sh /secure/backups/stash.dump
# Keep backups outside the repository; supply credentials through the process environment.
set -eu
: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"
: "${1:?Provide a destination outside the repository}"
umask 077
if [ -e "$1" ]; then echo 'Refusing to overwrite an existing backup' >&2; exit 1; fi
pg_dump --dbname="$BACKUP_DATABASE_URL" --format=custom --file="$1"
pg_restore --list "$1" >/dev/null
