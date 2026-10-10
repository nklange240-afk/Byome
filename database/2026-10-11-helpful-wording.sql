-- =========================================================
-- byome: the notification for the "Helpful" button on reviews says
-- "found your review of ... helpful" instead of "liked your review".
-- Run in the Supabase SQL Editor (after 2026-10-11-moderation-log.sql).
-- Safe to run again. Paste the whole file with nothing highlighted.
-- =========================================================

-- Same as before, with the new wording
create or replace function public.on_review_like() returns trigger
language plpgsql security definer set search_path to public as $$
declare author uuid; pname text;
begin
  select r.user_id, p.brand || ' — ' || p.name into author, pname
  from reviews r join products p on p.id = r.product_id where r.id = new.review_id;
  perform create_notification(author, new.user_id, 'review_like', new.review_id,
    username_of(new.user_id) || ' found your review of ' || coalesce(pname, 'a product') || ' helpful', 'reviews.html', true);
  perform check_review_engagement(new.review_id);
  return new;
end $$;

-- Reword the ones members already have
update public.notifications
set message = regexp_replace(message, ' liked your review of (.*)$', ' found your review of \1 helpful')
where type = 'review_like' and message like '% liked your review of %';
