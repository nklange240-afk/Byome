-- =========================================================
-- Byome: rewards for inviting friends, and shelf companions.
--  - 1 friend ("First friend"): the Paper chain pot (uncommon).
--  - 5 friends ("Social Butterfly"): the Swallowtail (rare), a companion.
--  - Companions are a new kind of shelf item: they don't go in a spot of
--    their own, they visit a pot that's already on the shelf (in front of
--    its plant). Members choose where in Arrange.
--  - Members who already reached these milestones get the items now.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================


-- ---------- A new kind of item: companions ----------
-- Like shelves and biomes, companions have no size: they fit any spot.
alter table public.biome_items drop constraint if exists biome_items_kind_check;
alter table public.biome_items add constraint biome_items_kind_check
  check (kind in ('pot', 'plant', 'shelf', 'biome', 'companion'));
alter table public.biome_items drop constraint if exists biome_items_check;
alter table public.biome_items add constraint biome_items_check
  check ((kind in ('shelf', 'biome', 'companion')) = (size is null));

-- Which companion (if any) is visiting each spot
alter table public.biome_slots add column if not exists companion_key text references public.biome_items(key);


-- ---------- The two rewards (earned, never sold) ----------
insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member)
values
  ('paper-chain', 'pot', 'small', 'Paper chain pot',
   'Hand in hand, like good friends. Earned by inviting your first friend to Byome.',
   'uncommon', null, 'biome-assets/pot-paper-chain.png', 9, 1),
  ('swallowtail', 'companion', null, 'Swallowtail',
   'Thanks for being a Social Butterfly and helping grow the Byome community!',
   'rare', null, 'biome-assets/companion-swallowtail.png', 1, 1)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, image = excluded.image, max_per_member = excluded.max_per_member;

update public.achievements set reward_item = 'paper-chain' where key = 'invite-1';
update public.achievements set reward_item = 'swallowtail', name = 'Social Butterfly' where key = 'invite-5';


-- ---------- Placing a companion ----------
-- p_key null takes the companion off that spot. A companion you only have
-- one of moves from wherever it was.
create or replace function public.set_biome_companion(p_slot int, p_key text default null) returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  it biome_items%rowtype;
  owned int;
  used int;
begin
  if me is null then raise exception 'Please log in first'; end if;
  if p_key is null then
    update biome_slots set companion_key = null, updated_at = now() where user_id = me and slot = p_slot;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('biome-slot'), hashtext(me::text));
  select * into it from biome_items where key = p_key;
  if not found or it.kind <> 'companion' then raise exception 'That isn''t a companion'; end if;
  if not exists (select 1 from biome_slots where user_id = me and slot = p_slot) then
    raise exception 'Put a pot in this spot first';
  end if;
  select count(*) into owned from biome_inventory where user_id = me and item_key = p_key;
  if owned = 0 then raise exception 'You don''t have that companion yet'; end if;

  -- all of them are busy elsewhere: move one over
  select count(*) into used from biome_slots where user_id = me and slot <> p_slot and companion_key = p_key;
  if used >= owned then
    update biome_slots set companion_key = null, updated_at = now()
    where user_id = me and slot = (select min(slot) from biome_slots
                                   where user_id = me and slot <> p_slot and companion_key = p_key);
  end if;

  update biome_slots set companion_key = p_key, updated_at = now() where user_id = me and slot = p_slot;
end $$;
revoke execute on function public.set_biome_companion(int, text) from public, anon;
grant execute on function public.set_biome_companion(int, text) to authenticated;


-- ---------- Members who already reached the milestones ----------
-- They earned the achievement before it came with an item, so give it now.
do $$
declare r record;
begin
  for r in
    select ua.user_id, a.name as achievement, it.key, it.name
    from user_achievements ua
    join achievements a on a.key = ua.achievement_key
    join biome_items it on it.key = a.reward_item
    join profiles p on p.id = ua.user_id and p.deleted_at is null
    where ua.achievement_key in ('invite-1', 'invite-5')
      and not exists (select 1 from biome_inventory bi where bi.user_id = ua.user_id and bi.item_key = it.key)
  loop
    insert into biome_inventory (user_id, item_key, source) values (r.user_id, r.key, 'achievement');
    perform create_notification(r.user_id, null, 'achievement', null,
      'Thanks for inviting friends! Your "' || r.achievement || '" achievement now comes with a '
        || lower(r.name) || ' for your biome. Put it on your shelf from your profile.',
      'profile.html');
  end loop;
end $$;

-- Tell the API about the new function straight away
notify pgrst, 'reload schema';

select a.key, a.name, a.reward_item,
       (select count(*) from public.biome_inventory bi where bi.item_key = a.reward_item) as members_with_it
from public.achievements a where a.key like 'invite-%' order by a.sort_order;
