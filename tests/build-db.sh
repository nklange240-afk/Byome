#!/bin/bash
# Builds a test database from scratch: tests/base-schema.sql, then every
# file in database/ in the order database/README.md lists them (the order
# they were run on the real database). Stops at the first error.
#   usage: tests/build-db.sh "<psql connection options>"
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL="psql $1 -q -v ON_ERROR_STOP=1 --set=client_min_messages=warning"
$PSQL -f tests/base-schema.sql > /dev/null
files=$(grep -o '`[0-9]\{4\}-[0-9][0-9]-[0-9][0-9]-[a-z0-9-]*\.sql`' database/README.md | tr -d '`' | awk '!seen[$0]++')
# every update file must be listed in the README, so none is skipped
for f in database/[0-9]*.sql; do
  b=$(basename "$f")
  grep -qx "$b" <<< "$files" || { echo "::error::$b isn't listed in database/README.md"; exit 1; }
done
for f in $files; do
  echo "Running $f"
  PGOPTIONS='--client-min-messages=warning' $PSQL -f "database/$f" > /dev/null
done
echo "Built the test database from $(wc -w <<< "$files") files."
