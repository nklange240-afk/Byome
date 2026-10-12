-- =========================================================
-- byome: which database updates have been applied?
-- Read-only: it changes nothing. Paste into the Supabase SQL Editor and
-- run; each update shows "yes" or "MISSING". Any MISSING one can be run
-- from this folder (oldest first).
-- =========================================================

with col(t, c) as (
  select table_name, column_name from information_schema.columns where table_schema = 'public'
), fn(name, body) as (
  select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
), tbl(name) as (
  select table_name from information_schema.tables where table_schema = 'public'
)
select file, case when ok then 'yes' else 'MISSING' end as applied
from (values
  ('2026-10-02-automod.sql',              exists (select 1 from col where t = 'posts' and c = 'held_at')),
  ('2026-10-02-biome-shop.sql',           exists (select 1 from tbl where name = 'biome_items')),
  ('2026-10-02-reports.sql',              exists (select 1 from tbl where name = 'content_reports')),
  ('2026-10-02-achievements.sql',         exists (select 1 from tbl where name = 'achievements')),
  ('2026-10-03-zebra-haworthia.sql',      exists (select 1 from public.biome_items where key = 'zebra-haworthia')),
  ('2026-10-03-moderator-alerts.sql',     exists (select 1 from fn where name = 'moderation_counts')),
  ('2026-10-03-profiles.sql (profiles)',  exists (select 1 from col where t = 'profiles' and c = 'skin_type')),
  -- the next two are also covered by 2026-10-11-profiles-catch-up.sql
  ('2026-10-03-profiles.sql (reporting profiles)', exists (select 1 from col where t = 'content_reports' and c = 'profile_id')),
  ('2026-10-03-profiles.sql (delete account)', exists (select 1 from fn where name = 'delete_my_account')),
  ('2026-10-03-african-violet.sql',       exists (select 1 from col where t = 'biome_items' and c = 'over_pot')),
  ('2026-10-03-terry-and-sweetheart.sql', exists (select 1 from col where t = 'biome_items' and c = 'max_per_member')),
  ('2026-10-03-avatar-ring.sql',          exists (select 1 from col where t = 'profiles' and c = 'avatar_ring')),
  ('2026-10-03-first-bloom.sql',          exists (select 1 from public.achievements where key = 'first-bloom')),
  ('2026-10-10-moderator-rewards.sql',    exists (select 1 from public.point_rules where action = 'mod_decision')),
  ('2026-10-10-profile-biomes.sql',       exists (select 1 from col where t = 'profiles' and c = 'profile_biome')),
  ('2026-10-10-helpful-reviews.sql',      exists (select 1 from col where t = 'reviews' and c = 'helpful_count')),
  ('2026-10-11-moderation-log.sql',       exists (select 1 from tbl where name = 'moderation_log')),
  ('2026-10-11-helpful-wording.sql',      exists (select 1 from fn where name = 'on_review_like' and body like '%found your review%')),
  ('2026-10-11-returned-content.sql',     exists (select 1 from tbl where name = 'returned_content')),
  ('2026-10-11-capital-byome.sql',        exists (select 1 from public.achievements where name = 'Welcome to Byome')),
  ('2026-10-12-byome-shop.sql',           exists (select 1 from public.point_rules where action = 'biome_purchase' and label = 'Byome Shop purchase')),
  ('2026-10-13-polls.sql',                exists (select 1 from fn where name = 'vote_poll')),
  ('2026-10-14-byome-points-right-away.sql', exists (select 1 from col where t = 'point_ledger' and c = 'biome_available_at')),
  ('2026-10-15-badges-and-held-points.sql', exists (select 1 from col where t = 'profiles' and c = 'badge')),
  ('2026-10-16-comment-edits.sql',        exists (select 1 from col where t = 'comments' and c = 'edited_at')),
  ('2026-10-17-pastel-pots.sql',          (select count(*) = 3 from public.biome_items where key in ('buttercup', 'lilac', 'blush')))
) as checks(file, ok);
