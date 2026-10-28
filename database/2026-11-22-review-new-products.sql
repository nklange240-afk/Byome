-- =========================================================
-- Byome: review a product that isn't on Byome yet, in one step.
-- A member writing a review can add the product right there. The product
-- goes to the moderators as a suggestion, and the review waits with it
-- (hidden from everyone else, like a held review, and its points wait too):
--  - Approved: the review goes live straight away, with its points (if
--    automod would have held its words, it waits for a moderator instead).
--  - Rejected: the review goes back to the member ("Returned to you" on
--    their profile), so their words aren't lost.
--  - Merged: if the product was already on Byome (a repeat suggestion),
--    a moderator merges it into the existing product. The review moves
--    there and goes live, and any new variations can be added to it. If the
--    member had already reviewed that product, the new review is returned
--    to them instead.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Run it before publishing the site update that
-- came with it.
-- =========================================================

alter table public.reviews add column if not exists awaiting_product boolean not null default false;

-- A review of a product that's still waiting for a moderator waits with it
create or replace function public.review_waits_for_product() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from products where id = new.product_id and status = 'pending') then
      new.awaiting_product := true;
      new.held_at := coalesce(new.held_at, now());
    else
      new.awaiting_product := false;
    end if;
  elsif coalesce(current_setting('byome.moderating', true), '') <> 'on' then
    new.awaiting_product := old.awaiting_product;  -- only the database changes this
  end if;
  return new;
end $$;
-- (named to run after automod, which decides held_at first)
drop trigger if exists reviews_wait_for_product on public.reviews;
create trigger reviews_wait_for_product before insert or update on public.reviews
for each row execute function public.review_waits_for_product();

-- Members can review approved products, or one they've just suggested
drop policy if exists "Members can review approved products" on public.reviews;
create policy "Members can review approved products" on public.reviews for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from products p where p.id = reviews.product_id
      and (p.status = 'approved' or (p.status = 'pending' and p.suggested_by = (select auth.uid())))));

-- "Automod held a review" isn't sent for a review that's only waiting for
-- its product (the product suggestion notification covers it)
create or replace function public.on_content_held() returns trigger
language plpgsql security definer set search_path to public as $$
declare what text := case tg_table_name
  when 'posts' then 'a post' when 'comments' then 'a comment'
  when 'reviews' then 'a review' else 'a review update' end;
begin
  if coalesce(to_jsonb(new)->>'awaiting_product', 'false') = 'true' then return new; end if;
  if new.held_at is not null and (tg_op = 'INSERT' or old.held_at is null) then
    perform notify_moderators(new.user_id, new.id, 'Automod held ' || what || ' for review.');
  end if;
  return new;
end $$;

-- Reviews waiting for their product aren't in the "held" count (the
-- product suggestion is)
create or replace function public.moderation_counts() returns integer
language plpgsql stable security definer set search_path to public as $$
begin
  if not is_moderator() then return 0; end if;
  return (select count(*) from products where status = 'pending')
       + (select count(*) from posts where held_at is not null)
       + (select count(*) from comments where held_at is not null)
       + (select count(*) from reviews where held_at is not null and not awaiting_product)
       + (select count(*) from review_updates where held_at is not null)
       + (select count(distinct coalesce(post_id, comment_id, review_id, profile_id))
            from content_reports where resolved_at is null)
       + (select count(*) from modmail_threads where status = 'open' and last_from = 'member');
end $$;

-- A review's product can only be changed by a moderator merging a suggestion
create or replace function public.lock_review_fields() returns trigger
language plpgsql set search_path to public as $$
begin
  if (new.product_id is distinct from old.product_id
        and coalesce(current_setting('byome.merging', true), '') <> 'on')
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     or (new.helpful_count is distinct from old.helpful_count
         and coalesce(current_setting('byome.counting', true), '') <> 'on') then
    raise exception 'That part of a review can''t be changed';
  end if;
  return new;
end $$;


-- ---------- Making a review live (shared by approving and merging) ----------
-- Releases one waiting review: live (with its points) unless automod would
-- hold its words, in which case it waits in the held queue as usual.
create or replace function public.release_waiting_review(p_review uuid, p_product uuid) returns boolean
language plpgsql security definer set search_path to public as $$
declare
  r reviews%rowtype;
  flagged boolean;
begin
  select * into r from reviews where id = p_review;
  if not found then return false; end if;
  flagged := text_is_flagged(coalesce(r.title, '') || ' ' || coalesce(r.body, ''));
  perform set_config('byome.moderating', 'on', true);
  perform set_config('byome.merging', 'on', true);
  update reviews set product_id = p_product, awaiting_product = false,
    held_at = case when flagged then held_at else null end
  where id = p_review;
  perform set_config('byome.merging', 'off', true);
  perform set_config('byome.moderating', 'off', true);
  if flagged then
    perform notify_moderators(r.user_id, r.id, 'Automod held a review for review.');
  end if;
  return not flagged;
end $$;
revoke execute on function public.release_waiting_review(uuid, uuid) from public, anon, authenticated;

-- Sends a waiting review back to its author (their words are kept).
-- p_product: the product to show it under (null keeps its own).
drop function if exists public.return_waiting_review(uuid, text, text);
create or replace function public.return_waiting_review(p_review uuid, p_reason text, p_note text, p_product uuid default null) returns void
language plpgsql security definer set search_path to public as $$
begin
  insert into returned_content (user_id, kind, title, body, product_id, rating, variation, would_repurchase, holy_grail, reason, reason_note)
  select user_id, 'review', title, body, coalesce(p_product, product_id), rating, variation, would_repurchase, holy_grail, p_reason, left(p_note, 500)
  from reviews where id = p_review;
  delete from reviews where id = p_review;
end $$;
revoke execute on function public.return_waiting_review(uuid, text, text, uuid) from public, anon, authenticated;


-- ---------- Approving or rejecting a suggestion ----------
-- Same as before (database/2026-10-24-variation-points.sql), plus what
-- happens to a review waiting for the product
create or replace function public.handle_product_status() returns trigger
language plpgsql security definer set search_path to public as $$
declare
  w record;
  live int := 0;
  waiting int := 0;
  returned int := 0;
  label text := new.brand || ' — ' || new.name;
begin
  if new.status is distinct from old.status then
    if new.status = 'approved' then
      for w in select id from reviews where product_id = new.id and awaiting_product loop
        if release_waiting_review(w.id, new.id) then live := live + 1; else waiting := waiting + 1; end if;
      end loop;
      perform create_notification(new.suggested_by, null, 'moderation', new.id,
        'Your product suggestion "' || label || '" was approved. '
        || case when live > 0 then 'Your review of it is live now!'
                when waiting > 0 then 'Your review of it is waiting for a quick check by a moderator.'
                else 'You can review it now!' end,
        'reviews.html', false, 'positive');
      perform award_points(new.suggested_by, 'product_approved', 'product', new.id);
      perform award_variation_points(new.id);
    elsif new.status = 'rejected' then
      for w in select id from reviews where product_id = new.id and awaiting_product loop
        perform return_waiting_review(w.id, 'product_not_approved', new.rejection_reason);
        returned := returned + 1;
      end loop;
      perform create_notification(new.suggested_by, null, 'moderation', new.id,
        'Your product suggestion "' || label || '" wasn''t approved.'
        || case when coalesce(new.rejection_reason, '') <> '' then ' Reason: ' || new.rejection_reason
                || case when new.rejection_reason ~ '[.!?]$' then '' else '.' end else '' end
        || case when returned > 0 then ' Your review has been saved on your profile under "Returned to you", so your words aren''t lost.' else '' end,
        case when returned > 0 then 'profile.html' else 'suggest-product.html' end, false, 'negative');
    end if;
  end if;
  return new;
end $$;


-- ---------- Merging a repeat suggestion into an existing product ----------
-- For moderators. The suggestion's waiting reviews move to the existing
-- product and go live (or are returned if the member already reviewed it),
-- new variations can be added to it, and the suggestion is removed.
-- Returns a short summary.
create or replace function public.merge_product_suggestion(p_product uuid, p_into uuid, p_add_variations boolean default true)
returns text
language plpgsql security definer set search_path to public as $$
declare
  src products%rowtype;
  dst products%rowtype;
  w record;
  live int := 0;
  waiting int := 0;
  returned int := 0;
  added text[] := '{}';
  v text;
  msg text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  select * into src from products where id = p_product;
  if not found or src.status <> 'pending' then raise exception 'That suggestion isn''t waiting any more'; end if;
  select * into dst from products where id = p_into;
  if not found or dst.status <> 'approved' then raise exception 'Choose a product that''s already on Byome'; end if;
  if src.id = dst.id then raise exception 'Choose a different product'; end if;

  -- New variations (not sizes, not already listed), up to 30 in all
  if p_add_variations then
    foreach v in array coalesce(src.variations, '{}') loop
      if btrim(v) <> '' and not looks_like_size(v)
         and not exists (select 1 from unnest(coalesce(dst.variations, '{}') || added) e where variation_key(e) = variation_key(v))
         and coalesce(array_length(dst.variations, 1), 0) + coalesce(array_length(added, 1), 0) < 30 then
        added := added || btrim(v);
      end if;
    end loop;
    if array_length(added, 1) > 0 then
      update products set variations = coalesce(variations, '{}') || added where id = dst.id;
    end if;
  end if;

  -- The waiting reviews
  for w in select id, user_id from reviews where product_id = src.id loop
    if exists (select 1 from reviews where product_id = dst.id and user_id = w.user_id) then
      perform return_waiting_review(w.id, 'already_reviewed', null, dst.id);
      returned := returned + 1;
    elsif release_waiting_review(w.id, dst.id) then
      live := live + 1;
    else
      waiting := waiting + 1;
    end if;
  end loop;

  -- Tell the member who suggested it
  msg := 'Thanks for suggesting "' || src.brand || ' — ' || src.name || '"! It was already on Byome as "'
    || dst.brand || ' — ' || dst.name || '"'
    || case when live > 0 then ', so your review has been added there and is live now.'
            when waiting > 0 then ', so your review has been added there. It''s waiting for a quick check by a moderator.'
            when returned > 0 then '. You''d already reviewed it, so your new review was saved on your profile under "Returned to you": you can add it as an update to your review there.'
            else ', so you can review it there.' end;
  perform create_notification(src.suggested_by, null, 'moderation', dst.id, msg,
    case when returned > 0 then 'profile.html' else 'reviews.html?product=' || dst.id end, false, 'positive');

  perform log_moderation('merge', 'product', src.id, src.suggested_by, 'positive',
    src.brand || ' — ' || src.name || ' → ' || dst.brand || ' — ' || dst.name);
  perform reward_moderator('mod_decision', 'product', src.id, src.suggested_by);
  delete from products where id = src.id;

  return 'Merged into ' || dst.brand || ' — ' || dst.name || '.'
    || case when live > 0 then ' ' || live || ' review' || case when live = 1 then ' is' else 's are' end || ' live there now.' else '' end
    || case when waiting > 0 then ' ' || waiting || ' waiting for automod review.' else '' end
    || case when returned > 0 then ' ' || returned || ' returned (already reviewed).' else '' end
    || case when array_length(added, 1) > 0 then ' Added variations: ' || array_to_string(added, ', ') || '.' else '' end;
end $$;
revoke execute on function public.merge_product_suggestion(uuid, uuid, boolean) from public, anon;
grant execute on function public.merge_product_suggestion(uuid, uuid, boolean) to authenticated;
