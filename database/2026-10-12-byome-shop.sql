-- =========================================================
-- Byome: the Biome shop is now the Byome Shop. This renames it where it's
-- stored in the database: purchases in each member's points activity.
-- Run in the Supabase SQL Editor (any time). Safe to run again.
-- Paste the whole file with nothing highlighted.
-- =========================================================

update public.point_rules set label = 'Byome Shop purchase'
where action = 'biome_purchase';
