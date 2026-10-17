-- =========================================================
-- Byome: four hidden achievements (they only show on a profile once
-- earned), each with a few Byome points right away. Their reward items
-- come later, when the art is ready (see the end of this file).
--  - Well Rounded (15 points): live reviews in 4 of the 6 product categories.
--  - Jack of All Trades (25 points): live reviews in all 6 categories.
--  - Brand Loyalist (15 points): reviews of 5 different products from the
--    same brand (capital letters and extra spaces don't matter).
--  - Window Shopper (10 points): visiting the Byome Shop in 10 different
--    hours without buying anything in those hours. Counting starts when
--    this file is run.
-- Members who already qualify for the review ones get them when this runs.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs the events file (2026-10-29) first.
--
-- When an item's art is in (I'll add the item; this hands it to everyone
-- who already has the achievement, and to everyone who earns it later):
--   select public.release_achievement_reward('well-rounded', 'item-key');
-- =========================================================

insert into public.point_rules (action, community_points, biome_points, delay_hours, label, notify)
values ('hidden_achievement', 0, 0, 0, 'Hidden achievement', false)
on conflict (action) do nothing;

-- (event_points is the achievement's own Byome points; despite the name it
-- works for any achievement)
insert into public.achievements (key, name, description, event_points, sort_order) values
  ('well-rounded', 'Well Rounded', 'Reviewed products from 4 different categories.', 15, 40),
  ('jack-of-all-trades', 'Jack of All Trades', 'Reviewed products from every category. Hair, body, makeup, skin, fragrance and nails: you''ve done it all!', 25, 41),
  ('brand-loyalist', 'Brand Loyalist', 'Reviewed 5 different products from the same brand. You know what you like!', 15, 42),
  ('window-shopper', 'Window Shopper', 'Browsed the Byome Shop 10 times without buying a thing. Just looking!', 10, 43)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, event_points = excluded.event_points;


-- ---------- Giving one (and its points) ----------
create or replace function public.grant_hidden_achievement(p_user uuid, p_key text) returns boolean
language plpgsql security definer set search_path to public as $$
declare
  a achievements%rowtype;
  new_id uuid;
begin
  if exists (select 1 from profiles where id = p_user and deleted_at is not null) then return false; end if;
  select * into a from achievements where key = p_key;
  if not grant_achievement(p_user, p_key) then return false; end if;
  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
  values (p_user, 'hidden_achievement', 0, coalesce(a.event_points, 0), 'achievement', md5(p_key)::uuid)
  on conflict (user_id, action, ref_id) where revoked_at is null and ref_id is not null do nothing
  returning id into new_id;
  if new_id is not null and coalesce(a.event_points, 0) > 0 then
    perform create_notification(p_user, null, 'points', new_id,
      'You earned ' || a.event_points || ' Byome points for "' || a.name || '"!', 'profile.html');
  end if;
  return true;
end $$;
revoke execute on function public.grant_hidden_achievement(uuid, text) from public, anon, authenticated;


-- ---------- Reviews: categories and brands ----------
create or replace function public.check_review_achievements(p_user uuid) returns void
language plpgsql security definer set search_path to public as $$
declare
  cats int;
  best_brand int;
begin
  select count(distinct p.category) into cats
  from reviews r join products p on p.id = r.product_id
  where r.user_id = p_user and r.held_at is null and p.category is not null;
  if cats >= 4 then perform grant_hidden_achievement(p_user, 'well-rounded'); end if;
  if cats >= 6 then perform grant_hidden_achievement(p_user, 'jack-of-all-trades'); end if;

  select max(n) into best_brand from (
    select count(distinct r.product_id) as n
    from reviews r join products p on p.id = r.product_id
    where r.user_id = p_user and r.held_at is null and coalesce(btrim(p.brand), '') <> ''
    group by lower(regexp_replace(btrim(p.brand), '\s+', ' ', 'g'))
  ) b;
  if best_brand >= 5 then perform grant_hidden_achievement(p_user, 'brand-loyalist'); end if;
end $$;
revoke execute on function public.check_review_achievements(uuid) from public, anon, authenticated;

create or replace function public.review_achievements_trigger() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if new.held_at is null then perform check_review_achievements(new.user_id); end if;
  return null;
end $$;
revoke execute on function public.review_achievements_trigger() from public, anon, authenticated;

drop trigger if exists review_hidden_achievements on public.reviews;
create trigger review_hidden_achievements after insert or update of held_at on public.reviews
for each row execute function public.review_achievements_trigger();


-- ---------- The shop: hours you visited ----------
create table if not exists public.shop_visits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  hour timestamptz not null,
  primary key (user_id, hour)
);
alter table public.shop_visits enable row level security;
revoke all on public.shop_visits from anon, authenticated;

-- Called by the shop page when it opens. An hour counts if you didn't buy
-- anything in it; ten of those earns Window Shopper.
create or replace function public.log_shop_visit() returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  browsed int;
begin
  if me is null then return; end if;
  insert into shop_visits (user_id, hour) values (me, date_trunc('hour', now())) on conflict do nothing;
  if exists (select 1 from user_achievements where user_id = me and achievement_key = 'window-shopper') then return; end if;
  select count(*) into browsed from shop_visits v
  where v.user_id = me
    and not exists (select 1 from biome_inventory i
                    where i.user_id = me and i.source = 'shop'
                      and date_trunc('hour', i.acquired_at) = v.hour);
  if browsed >= 10 then perform grant_hidden_achievement(me, 'window-shopper'); end if;
end $$;
revoke execute on function public.log_shop_visit() from public, anon;
grant execute on function public.log_shop_visit() to authenticated;


-- ---------- When the art is in ----------
-- Attaches the item and gives it to everyone who already has the
-- achievement (new earners get it through grant_achievement as usual).
create or replace function public.release_achievement_reward(p_achievement text, p_item text) returns text
language plpgsql security definer set search_path to public as $$
declare
  a achievements%rowtype;
  it biome_items%rowtype;
  r record;
  n int := 0;
begin
  select * into it from biome_items where key = p_item;
  if not found then return 'There''s no item "' || p_item || '" yet.'; end if;
  update achievements set reward_item = p_item where key = p_achievement returning * into a;
  if not found then return 'There''s no achievement "' || p_achievement || '".'; end if;
  for r in
    select ua.user_id from user_achievements ua
    join profiles p on p.id = ua.user_id and p.deleted_at is null
    where ua.achievement_key = p_achievement
      and not exists (select 1 from biome_inventory i where i.user_id = ua.user_id and i.item_key = p_item and i.source = 'achievement')
  loop
    insert into biome_inventory (user_id, item_key, source) values (r.user_id, p_item, 'achievement');
    perform create_notification(r.user_id, null, 'achievement', null,
      'Your reward for "' || a.name || '" is here: ' || it.name || '. Put it on your shelf from your profile!', 'profile.html?shelf=edit');
    n := n + 1;
  end loop;
  return 'Done: ' || n || ' member' || case when n = 1 then '' else 's' end || ' who already had it got the ' || it.name || '.';
end $$;
revoke execute on function public.release_achievement_reward(text, text) from public, anon, authenticated;


-- ---------- Members who already qualify ----------
do $$
declare r record;
begin
  for r in select distinct user_id from public.reviews where held_at is null loop
    perform public.check_review_achievements(r.user_id);
  end loop;
end $$;

select a.name, count(ua.user_id) as members
from public.achievements a left join public.user_achievements ua on ua.achievement_key = a.key
where a.key in ('well-rounded', 'jack-of-all-trades', 'brand-loyalist', 'window-shopper')
group by a.name, a.sort_order order by a.sort_order;
