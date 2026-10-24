-- =========================================================
-- Byome: how helpful a member's reviews have been, for their profile
-- ("54 people found AliceB's reviews helpful") and, later, for the
-- moderators' Bloom check.
--  - people: how many different members marked at least one of their
--    reviews helpful (one person liking many reviews counts once)
--  - votes: the total number of helpful marks
-- Only reviews that are live count (not held or removed), and never the
-- member's own marks.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

create or replace function public.member_helpful_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path to public as $$
  select jsonb_build_object(
    'people', count(distinct l.user_id),
    'votes', count(*))
  from review_likes l
  join reviews r on r.id = l.review_id
  where r.user_id = p_user and r.held_at is null and l.user_id <> p_user
$$;
revoke execute on function public.member_helpful_stats(uuid) from public;
grant execute on function public.member_helpful_stats(uuid) to anon, authenticated;
