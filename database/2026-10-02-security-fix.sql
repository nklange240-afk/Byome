-- Run in Supabase SQL Editor on 2026-10-02.
--
-- 1. Members could call the points/notification functions directly from the
--    browser (e.g. supabaseClient.rpc("award_points", ...)) and give themselves
--    points or send fake notifications. Only the database's own triggers
--    should call these.
revoke execute on function public.award_points(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.create_notification(uuid, uuid, text, uuid, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.check_post_engagement(uuid) from public, anon, authenticated;
revoke execute on function public.check_comment_engagement(uuid) from public, anon, authenticated;
revoke execute on function public.check_review_engagement(uuid) from public, anon, authenticated;

-- 2. Editing a review could move it to another product, which let people earn
--    review points twice for the same product. Posts could be re-dated to
--    stay at the top of the feed. Those fields are now locked after posting.
create or replace function public.lock_review_fields() returns trigger
language plpgsql set search_path to public as $$
begin
  if new.product_id is distinct from old.product_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'That part of a review can''t be changed';
  end if;
  return new;
end $$;
create trigger reviews_lock_fields before update on public.reviews
  for each row execute function public.lock_review_fields();

create or replace function public.lock_post_fields() returns trigger
language plpgsql set search_path to public as $$
begin
  if new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'That part of a post can''t be changed';
  end if;
  return new;
end $$;
create trigger posts_lock_fields before update on public.posts
  for each row execute function public.lock_post_fields();
