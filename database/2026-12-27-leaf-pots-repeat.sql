-- =========================================================
-- Byome: the falling-leaf pots can be caught more than once.
--  - The Falling leaves pot and the Autumn blaze pot have no per-member
--    limit any more. Once a member owns one, it comes up half as often
--    for them (about 1 catch in 17 and 1 in 14, instead of 1 in 9 and
--    1 in 8).
--  - The Garden snail stays one per member: once a member has it, it isn't
--    drawn for them again.
--  - The catch pop-up says when it's another one of something they have.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-12-18-falling-leaves.sql first.
-- =========================================================

update public.biome_items set max_per_member = null
where key in ('falling-leaves-pot', 'autumn-blaze-pot');

-- Catching a leaf (the same as in 2026-12-18-falling-leaves.sql, except
-- how the prize is drawn, and 'again' in what it returns)
create or replace function public.drifter_catch(p_id uuid) returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  s drifter_sightings%rowtype;
  d drifters%rowtype;
  prize drifter_prizes%rowtype;
  caught_today integer;
  again boolean := false;
begin
  if me is null then raise exception 'Please log in first'; end if;
  perform pg_advisory_xact_lock(hashtext('drifter'), hashtext(me::text));
  select * into s from drifter_sightings where id = p_id and user_id = me;
  if not found then raise exception 'That one isn''t yours to catch'; end if;
  if s.caught_at is not null then raise exception 'You already caught that one'; end if;
  select * into d from drifters where key = s.drifter_key;
  if now() > s.shown_at + make_interval(secs => d.catch_seconds) then
    raise exception 'Too late, it drifted away! Another will come by.';
  end if;
  select count(*) into caught_today from drifter_sightings
  where user_id = me and day = s.day and caught_at is not null;
  if caught_today >= d.daily_cap then raise exception 'That''s all for today. Come back tomorrow!'; end if;

  -- The prize: weighted at random. An item they already own comes up half
  -- as often, and one limited per member (max_per_member) that they
  -- already have as many of as allowed isn't drawn at all.
  select p.* into prize from drifter_prizes p
  left join biome_items i on i.key = p.item_key
  cross join lateral (select count(*) as n from biome_inventory v
                      where v.user_id = me and v.item_key = p.item_key) o
  where p.drifter_key = d.key
    and (p.item_key is null
         or (i.available and (i.max_per_member is null or o.n < i.max_per_member)))
  order by -ln(1 - random()) / (p.weight * case when p.item_key is not null and o.n > 0 then 0.5 else 1 end)
  limit 1;
  if not found then prize.points := 5; end if;
  again := prize.item_key is not null
           and exists (select 1 from biome_inventory v where v.user_id = me and v.item_key = prize.item_key);

  update drifter_sightings set caught_at = now(), points = coalesce(prize.points, 0), item_key = prize.item_key
  where id = s.id;
  if prize.item_key is not null then
    insert into biome_inventory (user_id, item_key, source) values (me, prize.item_key, 'drifter');
  else
    insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
    values (me, 'drifter_catch', 0, prize.points, 'drifter_sighting', s.id);
  end if;

  return jsonb_build_object(
    'name', d.name,
    'points', coalesce(prize.points, 0),
    'left_today', d.daily_cap - caught_today - 1,
    'again', again,
    'item', (select jsonb_build_object('key', i.key, 'name', i.name, 'image', i.image, 'kind', i.kind,
                                       'size', i.size, 'rarity', i.rarity, 'over_pot', i.over_pot)
             from biome_items i where i.key = prize.item_key));
end $$;
revoke execute on function public.drifter_catch(uuid) from public, anon;
grant execute on function public.drifter_catch(uuid) to authenticated;

notify pgrst, 'reload schema';
