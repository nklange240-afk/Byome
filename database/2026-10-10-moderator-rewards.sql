-- =========================================================
-- byome: moderators earn 5 Byome points for each moderation action,
-- and point messages say "Byome points". Run once in the Supabase SQL
-- Editor (after 2026-10-03-first-bloom.sql).
--
-- What counts (each one once per item, per moderator):
--   - approving or removing held content (automod queue)
--   - keeping or removing reported content, or acting on a reported profile
--   - approving or rejecting a product suggestion
--   - editing a product suggestion (counts separately from approving it)
-- Moderators don't earn points for moderating their own things, and
-- acting on something already handled by another moderator earns nothing.
-- These points don't send a notification each time (that would flood a
-- moderator's notifications); they show up in Recent activity on the profile.
-- =========================================================


-- ---------- The two kinds of moderator reward ----------
insert into public.point_rules (action, label, community_points, biome_points, delay_hours, description) values
  ('mod_decision', 'Moderator work', 0, 5, 0, 'Approving, removing or keeping something in the moderation queue.'),
  ('mod_edit', 'Moderator edit', 0, 5, 0, 'Tidying up a product suggestion before it goes live.')
on conflict (action) do nothing;


-- ---------- Points messages: "Byome points", and no zero amounts ----------
-- Same as before, except the wording, and moderator rewards don't notify.
create or replace function public.award_points(p_user uuid, p_action text, p_ref_type text, p_ref uuid)
returns boolean
language plpgsql security definer set search_path to public as $$
declare
  rule point_rules%rowtype;
  today_count int;
  new_id uuid;
  msg text;
  parts text[] := '{}';
begin
  select * into rule from point_rules where action = p_action;
  if not found then return false; end if;

  if rule.daily_cap is not null then
    select count(*) into today_count from point_ledger
    where user_id = p_user and action = p_action and revoked_at is null
      and created_at >= date_trunc('day', now());
    if today_count >= rule.daily_cap then return false; end if;
  end if;

  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id, available_at)
  values (p_user, p_action, rule.community_points, rule.biome_points, p_ref_type, p_ref,
          now() + make_interval(hours => rule.delay_hours))
  on conflict (user_id, action, ref_id) where revoked_at is null and ref_id is not null do nothing
  returning id into new_id;

  if new_id is null then return false; end if;
  if p_action like 'mod\_%' then return true; end if;  -- moderator rewards: no notification

  if rule.community_points <> 0 then parts := parts || (rule.community_points || ' community points'); end if;
  if rule.biome_points <> 0 then parts := parts || (rule.biome_points || ' Byome points'); end if;
  msg := 'You earned ' || array_to_string(parts, ' and ') || ': ' || rule.label || '.';
  if rule.delay_hours > 0 then
    msg := msg || ' They''ll be available in ' || rule.delay_hours || ' hours.';
  end if;
  perform create_notification(p_user, null, 'points', new_id, msg, 'profile.html');
  return true;
end $$;
revoke execute on function public.award_points(uuid, text, text, uuid) from public, anon, authenticated;


-- Gives the moderator who's acting right now their reward for an item.
-- p_author: whose item it is (no points for moderating your own things).
create or replace function public.reward_moderator(p_action text, p_ref_type text, p_ref uuid, p_author uuid)
returns void
language plpgsql security definer set search_path to public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_ref is null or not is_moderator() then return; end if;
  if p_author is not null and p_author = me then return; end if;
  perform award_points(me, p_action, p_ref_type, p_ref);
end $$;
revoke execute on function public.reward_moderator(text, text, uuid, uuid) from public, anon, authenticated;


-- ---------- Held content (automod queue) ----------
-- Same as before, plus the reward.
create or replace function public.moderate_content(p_kind text, p_id uuid, p_action text)
returns text
language plpgsql security definer set search_path to public as $$
declare
  tbl text;
  author uuid;
  what text := replace(p_kind, '_', ' ');
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;

  tbl := case p_kind when 'post' then 'posts' when 'comment' then 'comments'
                     when 'review' then 'reviews' when 'review_update' then 'review_updates' end;
  if tbl is null then raise exception 'Unknown kind: %', p_kind; end if;

  execute format('select user_id from %I where id = $1', tbl) into author using p_id;
  if author is null then return 'gone'; end if;  -- already deleted

  if p_action = 'approve' then
    perform set_config('byome.moderating', 'on', true);
    execute format('update %I set held_at = null where id = $1', tbl) using p_id;
    perform set_config('byome.moderating', 'off', true);
    perform create_notification(author, null, 'moderation', p_id,
      'A moderator approved your ' || what || '. Everyone can see it now.',
      case when p_kind in ('post', 'comment') then 'feed.html' else 'reviews.html' end);
    perform reward_moderator('mod_decision', p_kind, p_id, author);
    return 'approved';
  elsif p_action = 'remove' then
    execute format('delete from %I where id = $1', tbl) using p_id;
    perform create_notification(author, null, 'moderation', p_id,
      'A moderator removed your ' || what || ' because it didn''t follow the community guidelines.', null);
    perform reward_moderator('mod_decision', p_kind, p_id, author);
    return 'removed';
  end if;
  raise exception 'Unknown action: %', p_action;
end $$;


-- ---------- Reports ----------
-- Same as before, plus the reward. "Keep" only counts if there were open
-- reports to close (removing goes through moderate_content above).
create or replace function public.resolve_reports(p_kind text, p_id uuid, p_action text)
returns text
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  col text := case p_kind when 'post' then 'post_id' when 'comment' then 'comment_id'
                          when 'review' then 'review_id' when 'profile' then 'profile_id' end;
  r record;
  closed int;
  author uuid;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  if col is null then raise exception 'Unknown kind: %', p_kind; end if;

  if p_action = 'keep' then
    execute format('update content_reports set resolved_at = now(), resolved_by = $1, resolution = ''kept''
                    where %I = $2 and resolved_at is null', col) using me, p_id;
    get diagnostics closed = row_count;
    if closed > 0 then
      if p_kind = 'profile' then
        author := p_id;
      else
        execute format('select user_id from %I where id = $1',
          case p_kind when 'post' then 'posts' when 'comment' then 'comments' else 'reviews' end)
          into author using p_id;
      end if;
      perform reward_moderator('mod_decision', p_kind, p_id, author);
    end if;
    return 'kept';
  elsif p_action = 'remove' and p_kind <> 'profile' then
    for r in execute format('select distinct reporter_id from content_reports where %I = $1', col) using p_id loop
      perform create_notification(r.reporter_id, me, 'moderation', p_id,
        'Thanks for your report. A moderator removed the ' || p_kind || ' you flagged.', null);
    end loop;
    return moderate_content(p_kind, p_id, 'remove');
  end if;
  raise exception 'Unknown action: %', p_action;
end $$;


-- ---------- Reported profiles ----------
-- Same as before, plus the reward.
create or replace function public.moderate_profile(p_id uuid, p_action text)
returns text
language plpgsql security definer set search_path to public as $$
declare me uuid := auth.uid(); msg text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;

  if p_action = 'remove_avatar' then
    update profiles set avatar_path = null where id = p_id;
    msg := 'A moderator removed your profile picture because it didn''t follow the community guidelines. You can upload a new one on Edit profile.';
  elsif p_action = 'reset_username' then
    update profiles set username = 'member-' || right(replace(p_id::text, '-', ''), 12) where id = p_id;
    msg := 'A moderator reset your username because it didn''t follow the community guidelines. Please choose a new one on Edit profile.';
  else
    raise exception 'Unknown action: %', p_action;
  end if;

  update content_reports set resolved_at = now(), resolved_by = me, resolution = 'actioned'
  where profile_id = p_id and resolved_at is null;
  perform create_notification(p_id, null, 'moderation', p_id, msg, 'edit-profile.html');
  perform reward_moderator('mod_decision', 'profile', p_id, p_id);
  return 'done';
end $$;


-- ---------- Product suggestions ----------
-- Moderators approve, reject and edit suggestions straight on the
-- products table, so a trigger hands out the reward.
create or replace function public.reward_product_moderation() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if old.status <> 'pending' then return new; end if;
  if new.status in ('approved', 'rejected') then
    perform reward_moderator('mod_decision', 'product', new.id, new.suggested_by);
  elsif new.name is distinct from old.name or new.brand is distinct from old.brand
     or new.photo_url is distinct from old.photo_url or new.variations is distinct from old.variations
     or new.category is distinct from old.category or new.subcategory is distinct from old.subcategory then
    perform reward_moderator('mod_edit', 'product', new.id, new.suggested_by);
  end if;
  return new;
end $$;
revoke execute on function public.reward_product_moderation() from public, anon, authenticated;

create trigger products_reward_moderator after update on public.products
  for each row execute function public.reward_product_moderation();


-- ---------- Shop message wording ----------
-- buy_biome_item's "not enough" message, now "Byome points". Same as in
-- 2026-10-03-terry-and-sweetheart.sql otherwise.
create or replace function public.buy_biome_item(p_key text) returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  item biome_items%rowtype;
  balance int;
  new_id uuid;
  new_sold int;
begin
  if me is null then raise exception 'Please log in first'; end if;

  -- One purchase at a time per member, so the same points can't be spent twice
  perform pg_advisory_xact_lock(hashtext('biome-buy'), hashtext(me::text));
  -- and one at a time per item, so a limited edition can't oversell
  select * into item from biome_items where key = p_key for update;

  if not found or not item.available or item.price is null then raise exception 'That item isn''t for sale'; end if;
  if item.starter then raise exception 'Everyone already has that one'; end if;
  if item.max_supply is not null and item.sold >= item.max_supply then raise exception 'Sorry, that one is sold out'; end if;
  if item.kind = 'shelf' and exists (select 1 from biome_inventory where user_id = me and item_key = p_key) then
    raise exception 'You already own that shelf';
  end if;
  if item.max_per_member is not null
     and (select count(*) from biome_inventory where user_id = me and item_key = p_key) >= item.max_per_member then
    raise exception 'That one is limited to % per member, and you already have it', item.max_per_member;
  end if;

  select coalesce(sum(biome_points), 0) into balance from point_ledger
  where user_id = me and revoked_at is null and available_at <= now();
  if balance < item.price then raise exception 'Not enough Byome points yet'; end if;

  update biome_items set sold = sold + 1 where key = p_key returning sold into new_sold;
  insert into biome_inventory (user_id, item_key, serial, source)
  values (me, p_key, case when item.max_supply is not null then new_sold end, 'shop')
  returning id into new_id;
  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
  values (me, 'biome_purchase', 0, -item.price, 'biome_item', new_id);

  return jsonb_build_object(
    'serial', case when item.max_supply is not null then new_sold end,
    'balance', balance - item.price);
end $$;
