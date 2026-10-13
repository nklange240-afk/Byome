-- =========================================================
-- Byome: the Ladybug, the reward for the "Bug Finder" achievement.
--  - A companion that only visits small pots (the top and middle shelves)
--    and sits on the pot itself, keeping still.
--  - Anyone who already has Bug Finder gets the Ladybug now, with a
--    notification; anyone given it later gets it with the achievement.
-- Needs 2026-10-23-referral-rewards.sql and 2026-10-26-bug-finder.sql to
-- have been run. Run in the Supabase SQL Editor. Safe to run again. Paste
-- the whole file with nothing highlighted.
-- =========================================================


-- ---------- The Ladybug: a companion for small pots ----------
-- Companions can now have a size: a sized one only visits pots of that
-- size (the Swallowtail has none, so it visits any pot).
alter table public.biome_items drop constraint if exists biome_items_check;
alter table public.biome_items add constraint biome_items_check check (
  (kind in ('shelf', 'biome') and size is null)
  or (kind in ('pot', 'plant') and size is not null)
  or kind = 'companion');

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member)
values ('ladybug', 'companion', 'small', 'Ladybug',
        'For members who spot a bug and help make Byome better. Thank you!',
        'rare', null, 'biome-assets/companion-ladybug.png', 2, 1)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, image = excluded.image, max_per_member = excluded.max_per_member;

update public.achievements set reward_item = 'ladybug' where key = 'bug-finder';

-- Placing a companion (the same as in 2026-10-23-referral-rewards.sql, plus
-- the size check)
create or replace function public.set_biome_companion(p_slot int, p_key text default null) returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  it biome_items%rowtype;
  owned int;
  used int;
  spot_size text := case when p_slot between 0 and 7 then 'small' when p_slot between 8 and 10 then 'medium' end;
begin
  if me is null then raise exception 'Please log in first'; end if;
  if p_key is null then
    update biome_slots set companion_key = null, updated_at = now() where user_id = me and slot = p_slot;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('biome-slot'), hashtext(me::text));
  select * into it from biome_items where key = p_key;
  if not found or it.kind <> 'companion' then raise exception 'That isn''t a companion'; end if;
  if it.size is not null and it.size is distinct from spot_size then
    raise exception 'The % only visits % pots', lower(it.name), it.size;
  end if;
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

-- Members who were given Bug Finder before it came with the Ladybug
do $$
declare r record;
begin
  for r in
    select ua.user_id from user_achievements ua
    join profiles p on p.id = ua.user_id and p.deleted_at is null
    where ua.achievement_key = 'bug-finder'
      and not exists (select 1 from biome_inventory bi where bi.user_id = ua.user_id and bi.item_key = 'ladybug')
  loop
    insert into biome_inventory (user_id, item_key, source) values (r.user_id, 'ladybug', 'achievement');
    perform create_notification(r.user_id, null, 'achievement', null,
      'Thanks for spotting a bug! Your "Bug Finder" achievement now comes with a ladybug for your biome. Put it on a small pot from your profile.',
      'profile.html');
  end loop;
end $$;

-- Tell the API about the changed function straight away
notify pgrst, 'reload schema';

select a.key, a.name, a.reward_item, i.size as reward_fits,
       (select count(*) from public.biome_inventory bi where bi.item_key = 'ladybug') as members_with_it
from public.achievements a left join public.biome_items i on i.key = a.reward_item
where a.key = 'bug-finder';
