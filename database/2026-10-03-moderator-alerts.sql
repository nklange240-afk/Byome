-- =========================================================
-- byome: tell moderators when something needs them
-- Run this once in the Supabase SQL Editor (after 2026-10-02-reports.sql).
--
--   * Every moderator gets a notification when:
--       - someone suggests a product
--       - automod holds a post, comment, review or review update
--       - something is reported (once per item, not once per report)
--     Notifications never quote the content itself, so a slur that
--     automod caught isn't repeated in anyone's notifications.
--   * moderation_counts() gives the number waiting, shown as a badge on
--     the Moderate link in the menu.
-- =========================================================

create or replace function public.notify_moderators(p_actor uuid, p_ref uuid, p_message text) returns void
language plpgsql security definer set search_path to public as $$
declare m uuid;
begin
  for m in select id from profiles where is_moderator loop
    -- (create_notification skips the moderator who caused it)
    perform create_notification(m, p_actor, 'moderation_queue', p_ref, p_message, 'moderate-products.html');
  end loop;
end $$;
revoke execute on function public.notify_moderators(uuid, uuid, text) from public, anon, authenticated;


-- New product suggestion
create or replace function public.on_product_suggested() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if new.status = 'pending' then
    perform notify_moderators(new.suggested_by, new.id,
      'New product suggestion: ' || new.brand || ' — ' || new.name || '.');
  end if;
  return new;
end $$;

create trigger products_notify_moderators after insert on public.products
  for each row execute function public.on_product_suggested();


-- Automod held something (when it's first held, not on every later edit)
create or replace function public.on_content_held() returns trigger
language plpgsql security definer set search_path to public as $$
declare what text := case tg_table_name
  when 'posts' then 'a post' when 'comments' then 'a comment'
  when 'reviews' then 'a review' else 'a review update' end;
begin
  if new.held_at is not null and (tg_op = 'INSERT' or old.held_at is null) then
    perform notify_moderators(new.user_id, new.id, 'Automod held ' || what || ' for review.');
  end if;
  return new;
end $$;

create trigger posts_notify_moderators after insert or update of held_at on public.posts
  for each row execute function public.on_content_held();
create trigger comments_notify_moderators after insert or update of held_at on public.comments
  for each row execute function public.on_content_held();
create trigger reviews_notify_moderators after insert or update of held_at on public.reviews
  for each row execute function public.on_content_held();
create trigger review_updates_notify_moderators after insert or update of held_at on public.review_updates
  for each row execute function public.on_content_held();


-- A member reported something (only the first open report on an item)
create or replace function public.on_content_reported() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if not exists (
    select 1 from content_reports r
    where r.id <> new.id and r.resolved_at is null
      and r.post_id is not distinct from new.post_id
      and r.comment_id is not distinct from new.comment_id
      and r.review_id is not distinct from new.review_id
  ) then
    perform notify_moderators(new.reporter_id, coalesce(new.post_id, new.comment_id, new.review_id),
      'A member reported a ' || new.kind || '.');
  end if;
  return new;
end $$;

create trigger content_reports_notify_moderators after insert on public.content_reports
  for each row execute function public.on_content_reported();


-- ---------- How many things are waiting (for the menu badge) ----------
create or replace function public.moderation_counts() returns integer
language plpgsql stable security definer set search_path to public as $$
begin
  if not is_moderator() then return 0; end if;
  return (select count(*) from products where status = 'pending')
       + (select count(*) from posts where held_at is not null)
       + (select count(*) from comments where held_at is not null)
       + (select count(*) from reviews where held_at is not null)
       + (select count(*) from review_updates where held_at is not null)
       + (select count(distinct coalesce(post_id, comment_id, review_id))
            from content_reports where resolved_at is null);
end $$;
revoke execute on function public.moderation_counts() from public, anon;
grant execute on function public.moderation_counts() to authenticated;
