# Database

byome's database lives in Supabase. These files are a backup and a history of changes.

- `schema-export-YYYY-MM-DD.csv`: a snapshot of every table, security rule, function and trigger.
  To make a new one, run `export-schema-query.sql` in the Supabase SQL Editor and export the result as CSV.
- `YYYY-MM-DD-*.sql`: changes that were run in the SQL Editor, oldest first.
  (The export taken on 2026-10-02 is from *before* `2026-10-02-security-fix.sql` was run.)
