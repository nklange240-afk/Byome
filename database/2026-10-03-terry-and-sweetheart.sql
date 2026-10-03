-- =========================================================
-- byome: the Terry pot (shop, rare, one per member) and the
-- Sweetheart pot (earned with the "Spread the love" achievement:
-- give 50 likes). Run once in the Supabase SQL Editor
-- (after 2026-10-03-african-violet.sql).
-- =========================================================


-- ---------- "One per member" items ----------
-- max_per_member: how many one member can buy (null = no limit).
alter table public.biome_items add column max_per_member integer check (max_per_member > 0);

-- Same as before, plus the per-member limit
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
  if balance < item.price then raise exception 'Not enough biome points yet'; end if;

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


-- ---------- The two pots ----------
insert into public.biome_items (key, kind, size, name, description, rarity, price, max_per_member, image, sort_order) values
  ('terry', 'pot', 'small', 'Terry pot',
   'Terry keeps watch over whatever grows here.',
   'rare', 200, 1, 'biome-assets/pot-terry.png', 4),
  ('sweetheart', 'pot', 'small', 'Sweetheart pot',
   'For members who spread the love. Earned by giving 50 likes to other people''s posts, comments and reviews.',
   'uncommon', null, null, 'biome-assets/pot-sweetheart.png', 5);


-- ---------- "Spread the love": give 50 likes ----------
insert into public.achievements (key, name, description, reward_item, sort_order)
values ('spread-the-love', 'Spread the love', 'Gave 50 likes to other members'' posts, comments and reviews.', 'sweetheart', 2);

-- How many likes a member has given to other people's things (likes they
-- took back don't count, and neither do likes on their own things)
create or replace function public.likes_given(p_user uuid) returns integer
language sql stable security definer set search_path to public as $$
  select (select count(*) from likes l join posts p on p.id = l.post_id
           where l.user_id = p_user and p.user_id <> p_user)
       + (select count(*) from comment_likes l join comments c on c.id = l.comment_id
           where l.user_id = p_user and c.user_id <> p_user)
       + (select count(*) from review_likes l join reviews r on r.id = l.review_id
           where l.user_id = p_user and r.user_id <> p_user)
$$;
revoke execute on function public.likes_given(uuid) from public, anon, authenticated;

create or replace function public.check_spread_the_love() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if not exists (select 1 from user_achievements where user_id = new.user_id and achievement_key = 'spread-the-love')
     and likes_given(new.user_id) >= 50 then
    perform grant_achievement(new.user_id, 'spread-the-love');
  end if;
  return new;
end $$;

create trigger likes_spread_the_love after insert on public.likes
  for each row execute function public.check_spread_the_love();
create trigger comment_likes_spread_the_love after insert on public.comment_likes
  for each row execute function public.check_spread_the_love();
create trigger review_likes_spread_the_love after insert on public.review_likes
  for each row execute function public.check_spread_the_love();

-- Anyone who's already given 50 likes gets it now
select public.grant_achievement(id, 'spread-the-love') from public.profiles
where deleted_at is null and public.likes_given(id) >= 50;
