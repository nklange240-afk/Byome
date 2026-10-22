-- =========================================================
-- Byome: Community posts can be up to 2000 characters (was 1000), the
-- same as reviews. Run in the Supabase SQL Editor. Safe to run again.
-- Paste the whole file with nothing highlighted. Run it before
-- publishing the site update that came with it.
-- =========================================================
alter table public.posts drop constraint if exists posts_body_check;
alter table public.posts add constraint posts_body_check check (char_length(body) <= 2000);
